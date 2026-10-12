/* eslint-disable unicorn/require-post-message-target-origin, unicorn/prefer-add-event-listener -- Dedicated worker messaging has no targetOrigin; this worker owns its sole handler. */
/// <reference lib="webworker" />
import { KokoroTTS } from 'kokoro-js';
export type VoiceIn =
  | { type: 'load' }
  | { type: 'cancel'; id: number }
  | { type: 'speak'; id: number; text: string };
export type VoiceOut =
  | { type: 'progress'; loaded: number }
  | { type: 'ready'; engine: 'WebGPU' | 'WASM' }
  | { type: 'failed' }
  | { type: 'audio'; id: number; blob: Blob };
const ctx = self as unknown as DedicatedWorkerGlobalScope;
const post = (message: VoiceOut) => ctx.postMessage(message);
// Isolate library caches from other apps on the same github.io origin.
if (typeof caches !== 'undefined') {
  const open = caches.open.bind(caches);
  caches.open = (name: string) => open(`setoffiq-voice-${name}`);
}
let model: KokoroTTS | null = null;
let loading: Promise<KokoroTTS> | null = null;
let engine: 'WebGPU' | 'WASM' = 'WASM';
function load(): Promise<KokoroTTS> {
  if (model) return Promise.resolve(model);
  if (loading) return loading;
  const files = new Map<string, number>();
  loading = (async () => {
    const gpu = (
      navigator as Navigator & {
        gpu?: { requestAdapter(): Promise<unknown | null> };
      }
    ).gpu;
    let accelerated = false;
    try {
      accelerated = Boolean(await gpu?.requestAdapter());
    } catch {
      /* Use WASM when GPU access is unavailable. */
    }
    engine = accelerated ? 'WebGPU' : 'WASM';
    return KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
      dtype: accelerated ? 'fp32' : 'q8',
      device: accelerated ? 'webgpu' : 'wasm',
      progress_callback: (info) => {
        if (
          'file' in info &&
          'loaded' in info &&
          info.file &&
          typeof info.loaded === 'number'
        ) {
          files.set(info.file, info.loaded);
          post({
            type: 'progress',
            loaded: [...files.values()].reduce((sum, value) => sum + value, 0),
          });
        }
      },
    });
  })().then(async (tts) => {
    await tts.generate('Ready.', { voice: 'bf_emma' });
    model = tts;
    return tts;
  });
  return loading;
}
let latest = 0;
let queue: Promise<void> = Promise.resolve();
ctx.onmessage = ({ data }: MessageEvent<VoiceIn>) => {
  if (data.type === 'cancel') {
    if (latest === data.id) latest = 0;
    return;
  }
  if (data.type === 'load') {
    void load().then(
      () => post({ type: 'ready', engine }),
      () => post({ type: 'failed' }),
    );
    return;
  }
  latest = data.id;
  queue = queue.then(async () => {
    if (latest !== data.id) return;
    try {
      const tts = await load();
      if (latest !== data.id) return;
      const audio = await tts.generate(data.text, {
        voice: 'bf_emma',
        speed: 1,
      });
      if (latest === data.id)
        post({ type: 'audio', id: data.id, blob: audio.toBlob() });
    } catch {
      post({ type: 'failed' });
    }
  });
};
