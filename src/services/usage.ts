import { readJson, writeJson } from './storage';

export interface UsageRecord {
  provider: string;
  endpoint: string;
  at: number;
  outcome: 'success' | 'failure';
}

export interface ProviderUsage {
  provider: string;
  requestsLast24h: number;
  requestsLastHour: number;
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
  /** Documented daily ceiling, where the provider publishes one. */
  documentedDailyLimit: number | null;
}

/**
 * Documented ceilings, so the diagnostics page can show how close a browser is
 * to a public service's published limit. Verified 10 September 2026 — see
 * DATA-SOURCES.md.
 */
export const DOCUMENTED_DAILY_LIMITS: Record<string, number | null> = {
  'open-meteo': 10_000,
  'postcodes-io': null,
  osrm: null,
  'flight-snapshot': null,
  ollama: null,
};

const KEY = 'usage';
const COUNTS_KEY = 'usage-counts';
const MAX_RECORDS = 500;
const HOUR_MS = 60 * 60_000;
const KEEP_HOURS = 25;

/** Per-provider request counts, bucketed by hour. */
type Buckets = Record<string, Record<string, number>>;

/**
 * Counts requests this browser has made to each public service.
 *
 * SetoffIQ is a static site: every request comes from the visitor's own
 * browser and their own IP, so this is about not abusing a free service, not
 * about a shared quota. Nothing here is sent anywhere.
 */
export class ApiUsageTracker {
  /** Recent requests, for the diagnostics table. Capped so storage stays small. */
  private records: UsageRecord[];
  /**
   * Counts are kept separately from the record list. The list is capped, so
   * counting it would silently under-report once a browser passes that cap —
   * which is exactly the situation where knowing the real number matters.
   */
  private buckets: Buckets;

  constructor() {
    this.records = readJson<UsageRecord[]>(KEY) ?? [];
    this.buckets = readJson<Buckets>(COUNTS_KEY) ?? {};
  }

  record(provider: string, endpoint: string, outcome: UsageRecord['outcome'], now = Date.now()): void {
    this.records.push({ provider, endpoint, at: now, outcome });
    if (this.records.length > MAX_RECORDS) {
      this.records = this.records.slice(-MAX_RECORDS);
    }
    writeJson(KEY, this.records);

    const hour = String(Math.floor(now / HOUR_MS));
    const forProvider = this.buckets[provider] ?? {};
    forProvider[hour] = (forProvider[hour] ?? 0) + 1;
    this.buckets[provider] = forProvider;
    this.prune(now);
    writeJson(COUNTS_KEY, this.buckets);
  }

  private prune(now: number): void {
    const oldest = Math.floor(now / HOUR_MS) - KEEP_HOURS;
    for (const [provider, hours] of Object.entries(this.buckets)) {
      for (const hour of Object.keys(hours)) {
        if (Number(hour) < oldest) delete hours[hour];
      }
      if (Object.keys(hours).length === 0) delete this.buckets[provider];
    }
  }

  countSince(provider: string, since: number): number {
    const hours = this.buckets[provider];
    if (!hours) return 0;
    const firstHour = Math.floor(since / HOUR_MS);
    let total = 0;
    for (const [hour, count] of Object.entries(hours)) {
      if (Number(hour) >= firstHour) total += count;
    }
    return total;
  }

  summarise(now = Date.now()): ProviderUsage[] {
    const providers = [...new Set(this.records.map((entry) => entry.provider))].sort();
    return providers.map((provider) => {
      const forProvider = this.records.filter((entry) => entry.provider === provider);
      const successes = forProvider.filter((entry) => entry.outcome === 'success');
      const failures = forProvider.filter((entry) => entry.outcome === 'failure');
      return {
        provider,
        requestsLast24h: this.countSince(provider, now - 24 * 60 * 60_000),
        requestsLastHour: this.countSince(provider, now - 60 * 60_000),
        lastSuccessAt: successes.length ? successes[successes.length - 1]!.at : null,
        lastFailureAt: failures.length ? failures[failures.length - 1]!.at : null,
        documentedDailyLimit: DOCUMENTED_DAILY_LIMITS[provider] ?? null,
      };
    });
  }

  /** True when this browser is near a provider's documented daily ceiling. */
  shouldBackOff(provider: string, now = Date.now()): boolean {
    const limit = DOCUMENTED_DAILY_LIMITS[provider];
    if (!limit) return false;
    return this.countSince(provider, now - 24 * 60 * 60_000) >= limit * 0.8;
  }

  all(): UsageRecord[] {
    return [...this.records];
  }

  reset(): void {
    this.records = [];
    this.buckets = {};
    writeJson(KEY, this.records);
    writeJson(COUNTS_KEY, this.buckets);
  }
}

export const apiUsage = new ApiUsageTracker();
