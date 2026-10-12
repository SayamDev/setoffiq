/* eslint-disable unicorn/require-post-message-target-origin, unicorn/prefer-add-event-listener -- Dedicated workers have no targetOrigin; each private instance owns its handlers. */
import { readRaw, writeRaw } from '../storage';
import type { VoiceIn, VoiceOut } from './kokoro.worker';
export interface NaturalState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  loaded: number;
  message: string;
}
let state: NaturalState = { status: 'idle', loaded: 0, message: '' };
const listeners = new Set<() => void>();
export const naturalState = () => state;
export const naturalEnabled = () => readRaw('natural-voice') === 'true';
export function subscribeNatural(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function update(patch: Partial<NaturalState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}
let worker: Worker | null = null;
let loading: Promise<void> | null = null;
let nextId = 0;
let rejectLoad: ((error: Error) => void) | null = null;
let watchdog: ReturnType<typeof setTimeout> | undefined;
const pending = new Map<
  number,
  { resolve(blob: Blob): void; reject(error: Error): void; cleanup(): void }
>();
function discard() {
  clearTimeout(watchdog);
  rejectLoad?.(new Error('Voice stopped.'));
  rejectLoad = null;
  worker?.terminate();
  worker = null;
  loading = null;
  for (const item of pending.values()) {
    item.cleanup();
    item.reject(new Error('Voice stopped.'));
  }
  pending.clear();
}
/** Voice preference persists, never any text or generated audio. Cached weights still need a new runtime after reload. */
export function enableNatural(): Promise<void> {
  writeRaw('natural-voice', 'true');
  return loadNatural();
}
export function disableNatural(): void {
  writeRaw('natural-voice', 'false');
  discard();
  update({ status: 'idle', loaded: 0, message: 'Using the device voice.' });
}
export function loadNatural(): Promise<void> {
  if (state.status === 'ready' && worker) return Promise.resolve();
  if (loading) return loading;
  if (!naturalEnabled())
    return Promise.reject(new Error('Natural voice is off.'));
  if (typeof Worker === 'undefined' || typeof WebAssembly === 'undefined') {
    update({
      status: 'error',
      message:
        'This browser cannot run the natural voice. Use a device voice instead.',
    });
    return Promise.reject(
      new Error('This browser cannot run the natural voice.'),
    );
  }
  update({
    status: 'loading',
    loaded: 0,
    message:
      'Loading the natural voice. The first download can take a few minutes.',
  });
  loading = new Promise<void>((resolve, reject) => {
    rejectLoad = reject;
    const fail = () => {
      discard();
      update({
        status: 'error',
        message:
          'Natural voice unavailable. Use the device voice or retry the download.',
      });
      reject(new Error('Natural voice unavailable.'));
    };
    watchdog = setTimeout(fail, 180000);
    try {
      const instance = new Worker(
        new URL('./kokoro.worker.ts', import.meta.url),
        { type: 'module' },
      );
      worker = instance;
      instance.onerror = () => {
        if (worker === instance) fail();
      };
      instance.onmessage = ({ data }: MessageEvent<VoiceOut>) => {
        if (worker !== instance) return;
        if (data.type === 'progress')
          update({
            loaded: data.loaded,
            message: `Loaded ${(data.loaded / 1000000).toFixed(1)} MB. Preparing the voice…`,
          });
        if (data.type === 'ready') {
          clearTimeout(watchdog);
          rejectLoad = null;
          update({
            status: 'ready',
            message: `Natural British voice ready (${data.engine}). Speech is generated on this device.`,
          });
          resolve();
        }
        if (data.type === 'failed') fail();
        if (data.type === 'audio') {
          const item = pending.get(data.id);
          if (item) {
            pending.delete(data.id);
            item.cleanup();
            item.resolve(data.blob);
          }
        }
      };
      instance.postMessage({ type: 'load' } satisfies VoiceIn);
    } catch {
      fail();
    }
  });
  const current = loading;
  void current.catch(() => {
    if (loading === current) loading = null;
  });
  return current;
}
export async function naturalAudio(
  text: string,
  signal: AbortSignal,
): Promise<Blob> {
  await loadNatural();
  if (signal.aborted) throw new DOMException('Stopped', 'AbortError');
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const abort = () => {
      pending.delete(id);
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      worker?.postMessage({ type: 'cancel', id } satisfies VoiceIn);
      reject(new DOMException('Stopped', 'AbortError'));
    };
    const timer = setTimeout(() => {
      pending.delete(id);
      signal.removeEventListener('abort', abort);
      worker?.postMessage({ type: 'cancel', id } satisfies VoiceIn);
      reject(new DOMException('Voice took too long', 'TimeoutError'));
    }, 15000);
    signal.addEventListener('abort', abort, { once: true });
    pending.set(id, {
      resolve,
      reject,
      cleanup: () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
      },
    });
    worker!.postMessage({ type: 'speak', id, text } satisfies VoiceIn);
  });
}
export async function removeNatural(): Promise<void> {
  disableNatural();
  if (typeof caches !== 'undefined') {
    for (const name of await caches.keys())
      if (name.startsWith('setoffiq-voice-')) await caches.delete(name);
  }
  update({ message: 'Downloaded voice files removed.' });
}

/** First-visit default. Never override a saved opt-out or retry failures in a loop. */
export function prepareNaturalAutomatically(): Promise<void> {
  if (readRaw('natural-voice') === 'false' || state.status === 'error')
    return Promise.resolve();
  const connection = (
    navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }
  ).connection;
  if (
    !navigator.onLine ||
    connection?.saveData ||
    /^(slow-2g|2g|3g)$/.test(connection?.effectiveType ?? '')
  ) {
    update({
      message:
        'Automatic voice download paused to save data. You can start it in Voice settings.',
    });
    return Promise.resolve();
  }
  return enableNatural();
}
