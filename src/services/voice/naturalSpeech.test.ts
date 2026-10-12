import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { VoiceSpeech } from './speech';
import { naturalAudio } from './natural';
vi.mock('./natural', () => ({
  naturalEnabled: () => true,
  naturalState: () => ({ status: 'ready' }),
  loadNatural: vi.fn(),
  naturalAudio: vi.fn(),
}));
class FakeAudio {
  static instances: FakeAudio[] = [];
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  pause = vi.fn();
  play = vi.fn(async () => {});
  constructor(public src: string) {
    FakeAudio.instances.push(this);
  }
}
function setup() {
  const callbacks = {
    state: vi.fn(),
    transcript: vi.fn(),
    final: vi.fn(),
    message: vi.fn(),
    output: vi.fn(),
    notice: vi.fn(),
  };
  return { speech: new VoiceSpeech(callbacks), callbacks };
}
beforeEach(() => {
  FakeAudio.instances = [];
  vi.stubGlobal('Audio', FakeAudio);
  vi.stubGlobal(
    'SpeechSynthesisUtterance',
    class {
      constructor(public text: string) {}
    },
  );
  vi.stubGlobal('speechSynthesis', {
    getVoices: () => [{ name: 'Local', localService: true, lang: 'en-GB' }],
    cancel: vi.fn(),
    speak: vi.fn(),
  });
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:local');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.mocked(naturalAudio).mockResolvedValue(new Blob(['wav']));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
const tick = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};
it('speaks sentence chunks and releases generated audio after playback', async () => {
  const { speech, callbacks } = setup();
  speech.say('Set off at 18:30 today. Confidence is low.', true);
  await tick();
  expect(naturalAudio).toHaveBeenCalledWith(
    'Set off at 6 30 p.m. today.',
    expect.any(AbortSignal),
  );
  expect(callbacks.state).toHaveBeenLastCalledWith('speaking');
  expect(callbacks.output).toHaveBeenLastCalledWith('natural');
  FakeAudio.instances[0]!.onended?.();
  await tick();
  expect(naturalAudio).toHaveBeenLastCalledWith(
    'Confidence is low.',
    expect.any(AbortSignal),
  );
  FakeAudio.instances[1]!.onended?.();
  await tick();
  expect(callbacks.state).toHaveBeenLastCalledWith('idle');
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
  speech.stop();
});
it('never plays stale generated speech after a correction or stop', async () => {
  let complete: (blob: Blob) => void = () => {};
  vi.mocked(naturalAudio).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  const { speech } = setup();
  speech.say('Old departure', true);
  speech.stop();
  complete(new Blob(['wav']));
  await tick();
  expect(FakeAudio.instances).toHaveLength(0);
});
it('interrupts current playback and does not continue the next sentence', async () => {
  const { speech } = setup();
  speech.say('First sentence. Second sentence.', true);
  await tick();
  const audio = FakeAudio.instances[0]!;
  speech.stop();
  audio.onended?.();
  await tick();
  expect(audio.pause).toHaveBeenCalledOnce();
  expect(naturalAudio).toHaveBeenCalledTimes(1);
});
it('falls back to a local device voice when generation fails', async () => {
  vi.mocked(naturalAudio).mockRejectedValueOnce(new Error('Device too slow'));
  const { speech } = setup();
  speech.say('Set off at 18:30.', true);
  await tick();
  expect(window.speechSynthesis.speak).toHaveBeenCalledWith(
    expect.objectContaining({ text: 'Set off at 6 30 p.m.' }),
  );
  speech.stop();
});
