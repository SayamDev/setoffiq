import { apiUsage } from './usage';

export interface RequestOptions {
  provider: string;
  endpoint: string;
  timeoutMs?: number;
  /** Retries are for transient failures only; 4xx responses are never retried. */
  retries?: number;
  signal?: AbortSignal;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_RETRIES = 2;

/** In-flight requests, so two components asking at once make one request. */
const inFlight = new Map<string, Promise<unknown>>();

/** Politeness gate: never hammer a free public service in a tight loop. */
const MIN_INTERVAL_MS: Record<string, number> = { osrm: 1_000, 'postcodes-io': 250 };
const lastRequestAt = new Map<string, number>();

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

async function respectInterval(provider: string, signal?: AbortSignal): Promise<void> {
  const minimum = MIN_INTERVAL_MS[provider];
  if (!minimum) return;
  const last = lastRequestAt.get(provider);
  if (last !== undefined) {
    const wait = minimum - (Date.now() - last);
    if (wait > 0) await delay(wait, signal);
  }
  lastRequestAt.set(provider, Date.now());
}

async function requestOnce<T>(url: string, options: RequestOptions): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const onOuterAbort = (): void => controller.abort();
  options.signal?.addEventListener('abort', onOuterAbort, { once: true });

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (!response.ok) {
      // 4xx means the request itself was wrong; repeating it will not help and
      // would be exactly the kind of pointless traffic these services ask us
      // not to generate.
      const retryable = response.status >= 500 || response.status === 429;
      throw new ProviderError(`${options.provider} responded ${response.status}`, response.status, retryable);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', onOuterAbort);
  }
}

/**
 * Fetch JSON with a timeout, bounded retries with exponential backoff, and
 * request deduplication. Errors thrown here are never shown to a user
 * verbatim; providers translate them into plain language.
 */
export async function fetchJson<T>(url: string, options: RequestOptions): Promise<T> {
  const existing = inFlight.get(url);
  if (existing) return existing as Promise<T>;

  const attempt = async (): Promise<T> => {
    const retries = options.retries ?? DEFAULT_RETRIES;
    let lastError: unknown;

    for (let index = 0; index <= retries; index += 1) {
      try {
        await respectInterval(options.provider, options.signal);
        const result = await requestOnce<T>(url, options);
        apiUsage.record(options.provider, options.endpoint, 'success');
        return result;
      } catch (error) {
        lastError = error;
        if (error instanceof DOMException && error.name === 'AbortError') throw error;
        if (error instanceof ProviderError && !error.retryable) break;
        if (index === retries) break;
        await delay(400 * 3 ** index, options.signal);
      }
    }

    apiUsage.record(options.provider, options.endpoint, 'failure');
    throw lastError;
  };

  const promise = attempt().finally(() => inFlight.delete(url));
  inFlight.set(url, promise);
  return promise;
}

/** Test seam: clears deduplication and rate-limit state between cases. */
export function resetHttpState(): void {
  inFlight.clear();
  lastRequestAt.clear();
}
