import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  disableNatural,
  enableNatural,
  loadNatural,
  naturalAudio,
  naturalEnabled,
  naturalState,
  removeNatural,
} from './natural';
import type { VoiceIn, VoiceOut } from './kokoro.worker';
class FakeWorker {
  static all: FakeWorker[] = [];
  onmessage: ((event: MessageEvent<VoiceOut>) => void) | null = null;
  onerror: (() => void) | null = null;
  sent: VoiceIn[] = [];
  terminate = vi.fn();
  constructor() {
    FakeWorker.all.push(this);
  }
  postMessage(message: VoiceIn) {
    this.sent.push(message);
  }
  deliver(data: VoiceOut) {
    this.onmessage?.({ data } as MessageEvent<VoiceOut>);
  }
}
beforeEach(() => {
  localStorage.clear();
  FakeWorker.all = [];
  vi.stubGlobal('Worker', FakeWorker);
});
afterEach(() => {
  disableNatural();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it('never downloads without explicit opt-in', async () => {
  expect(naturalEnabled()).toBe(false);
  await expect(loadNatural()).rejects.toThrow('off');
  expect(FakeWorker.all).toHaveLength(0);
});
it('deduplicates loading and generates locally only once ready', async () => {
  const ready = enableNatural();
  expect(loadNatural()).toBe(ready);
  expect(naturalState().status).toBe('loading');
  const worker = FakeWorker.all[0]!;
  worker.deliver({ type: 'ready', engine: 'WASM' });
  await ready;
  const promise = naturalAudio(
    'Set off at six thirty p.m.',
    new AbortController().signal,
  );
  await Promise.resolve();
  const request = worker.sent.find((message) => message.type === 'speak');
  if (!request || request.type !== 'speak')
    throw new Error('Missing speech request');
  const blob = new Blob(['wave']);
  worker.deliver({ type: 'audio', id: request.id, blob });
  expect(await promise).toBe(blob);
  expect(localStorage.getItem('setoffiq:natural-voice')).toBe('true');
  expect(JSON.stringify(localStorage)).not.toContain('six thirty');
});
it('recreates a runtime for an opted-in user after reopening instead of trusting a saved choice', async () => {
  localStorage.setItem('setoffiq:natural-voice', 'true');
  const promise = loadNatural();
  expect(FakeWorker.all).toHaveLength(1);
  expect(naturalState().status).toBe('loading');
  FakeWorker.all[0]!.deliver({ type: 'ready', engine: 'WASM' });
  await promise;
  expect(naturalState().status).toBe('ready');
});
it('cancels loading and rejects the waiting caller', async () => {
  const promise = enableNatural();
  const result = expect(promise).rejects.toThrow('stopped');
  disableNatural();
  await result;
  expect(FakeWorker.all[0]!.terminate).toHaveBeenCalledOnce();
  expect(naturalState().status).toBe('idle');
});
it('rejects cancelled generation and ignores its late audio', async () => {
  const ready = enableNatural();
  const worker = FakeWorker.all[0]!;
  worker.deliver({ type: 'ready', engine: 'WASM' });
  await ready;
  const controller = new AbortController();
  const speech = naturalAudio('Old result', controller.signal);
  const rejected = expect(speech).rejects.toMatchObject({ name: 'AbortError' });
  await Promise.resolve();
  controller.abort();
  await rejected;
  expect(worker.sent.at(-1)).toMatchObject({ type: 'cancel' });
  worker.deliver({ type: 'audio', id: 1, blob: new Blob() });
  expect(naturalState().status).toBe('ready');
});
it('bounds failed download and allows retry', async () => {
  vi.useFakeTimers();
  const promise = enableNatural();
  const rejected = expect(promise).rejects.toThrow();
  vi.advanceTimersByTime(180000);
  await rejected;
  expect(naturalState().status).toBe('error');
  const retry = enableNatural();
  FakeWorker.all[1]!.deliver({ type: 'ready', engine: 'WASM' });
  await retry;
  expect(naturalState().status).toBe('ready');
});
it('removes only SetoffIQ voice caches and stops the worker', async () => {
  const remove = vi.fn(async (_name: string) => true);
  vi.stubGlobal('caches', {
    keys: async () => [
      'setoffiq-v1',
      'transformers-cache',
      'setoffiq-voice-transformers-cache',
      'setoffiq-voice-kokoro-voices',
    ],
    delete: remove,
  });
  await removeNatural();
  expect(remove.mock.calls.map((call) => call[0])).toEqual([
    'setoffiq-voice-transformers-cache',
    'setoffiq-voice-kokoro-voices',
  ]);
  expect(naturalEnabled()).toBe(false);
});

it('automatically prepares on first visit but honours a saved opt-out', async () => {
  const { prepareNaturalAutomatically } = await import('./natural');
  const first = prepareNaturalAutomatically();
  expect(FakeWorker.all).toHaveLength(1);
  FakeWorker.all[0]!.deliver({ type: 'ready', engine: 'WASM' });
  await first;
  disableNatural();
  await prepareNaturalAutomatically();
  expect(FakeWorker.all).toHaveLength(1);
});
it.each([{ saveData: true }, { effectiveType: '2g' }, { effectiveType: '3g' }])('defers automatic downloads for a constrained connection %j', async (connection) => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  Object.defineProperty(navigator, 'connection', { configurable: true, value: connection });
  const { prepareNaturalAutomatically } = await import('./natural');
  await prepareNaturalAutomatically();
  expect(FakeWorker.all).toHaveLength(0);
  expect(naturalState().message).toContain('save data');
  Reflect.deleteProperty(navigator, 'connection');
});
it('does not download automatically when offline', async () => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  const { prepareNaturalAutomatically } = await import('./natural');
  await prepareNaturalAutomatically();
  expect(FakeWorker.all).toHaveLength(0);
});
