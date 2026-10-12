import { afterEach, describe, expect, it, vi } from 'vitest';
import { VoiceSpeech } from './speech';
import type { Recognition } from './speech';
class FakeRecognition implements Recognition {
  static instances: FakeRecognition[] = [];
  lang = '';
  continuous = false;
  interimResults = false;
  onresult: Recognition['onresult'] = null;
  onerror: Recognition['onerror'] = null;
  onend: Recognition['onend'] = null;
  onstart: Recognition['onstart'] = null;
  aborted = false;
  constructor() {
    FakeRecognition.instances.push(this);
  }
  start() {
    this.onstart?.();
  }
  abort() {
    this.aborted = true;
  }
}
function setup() {
  vi.stubGlobal('SpeechRecognition', FakeRecognition);
  const callbacks = {
    state: vi.fn(),
    transcript: vi.fn(),
    final: vi.fn(),
    message: vi.fn(),
  };
  const session = new VoiceSpeech(callbacks);
  return { session, callbacks };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  FakeRecognition.instances = [];
});
describe('browser speech lifecycle', () => {
  it('streams interim text without executing it and executes a final once', () => {
    const { session, callbacks } = setup();
    session.start();
    const recognition = FakeRecognition.instances[0]!;
    recognition.onresult?.({
      resultIndex: 0,
      results: [{ isFinal: false, 0: { transcript: 'landing at' } }],
    });
    expect(callbacks.transcript).toHaveBeenLastCalledWith('landing at');
    expect(callbacks.final).not.toHaveBeenCalled();
    const deliver = recognition.onresult!;
    deliver({
      resultIndex: 0,
      results: [{ isFinal: true, 0: { transcript: 'landing at 18:30' } }],
    });
    deliver({
      resultIndex: 0,
      results: [{ isFinal: true, 0: { transcript: 'landing at 18:30' } }],
    });
    expect(callbacks.final).toHaveBeenCalledExactlyOnceWith('landing at 18:30');
    expect(recognition.aborted).toBe(true);
    session.stop();
  });
  it('stops on denied permission, with no automatic restart', () => {
    const { session, callbacks } = setup();
    session.start();
    FakeRecognition.instances[0]!.onerror?.({ error: 'not-allowed' });
    expect(callbacks.message).toHaveBeenCalledWith(
      expect.stringContaining('permission was denied'),
    );
    expect(FakeRecognition.instances).toHaveLength(1);
  });
  it('bounds repeated browser session endings by the original silence deadline', () => {
    vi.useFakeTimers();
    const { session, callbacks } = setup();
    session.start();
    vi.advanceTimersByTime(30000);
    FakeRecognition.instances[0]!.onend?.();
    expect(FakeRecognition.instances).toHaveLength(2);
    vi.advanceTimersByTime(30000);
    expect(callbacks.message).toHaveBeenCalledWith(
      expect.stringContaining('minute'),
    );
    expect(FakeRecognition.instances[1]!.aborted).toBe(true);
  });
  it('does not interpret its own speaker output and resumes after local speech', () => {
    const { session, callbacks } = setup();
    let spoken: SpeechSynthesisUtterance | null = null;
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        constructor(public text: string) {}
      },
    );
    vi.stubGlobal('speechSynthesis', {
      cancel: vi.fn(),
      getVoices: () => [{ localService: true, lang: 'en-GB' }],
      speak: (utterance: SpeechSynthesisUtterance) => {
        spoken = utterance;
      },
    });
    session.start();
    session.say('Set off at 17:30');
    expect(FakeRecognition.instances[0]!.aborted).toBe(true);
    expect(callbacks.state).toHaveBeenLastCalledWith('speaking');
    expect(spoken).not.toBeNull();
    const utterance = spoken as unknown as SpeechSynthesisUtterance;
    utterance.onend?.(new Event('end') as SpeechSynthesisEvent);
    expect(FakeRecognition.instances).toHaveLength(2);
    session.stop();
  });
  it('does not use a remote synthesis voice', () => {
    const { session } = setup();
    const speak = vi.fn();
    vi.stubGlobal('speechSynthesis', {
      cancel: vi.fn(),
      getVoices: () => [{ localService: false, lang: 'en-GB' }],
      speak,
    });
    session.start();
    session.say('result');
    expect(speak).not.toHaveBeenCalled();
    session.stop();
  });
  it('does not restart from an old synthesis callback after interruption', () => {
    const { session } = setup();
    let utterance: SpeechSynthesisUtterance | undefined;
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        constructor(public text: string) {}
      },
    );
    vi.stubGlobal('speechSynthesis', {
      cancel: vi.fn(),
      getVoices: () => [{ localService: true, lang: 'en-GB' }],
      speak: (value: SpeechSynthesisUtterance) => {
        utterance = value;
      },
    });
    session.start();
    session.say('answer');
    session.stop();
    utterance?.onend?.(new Event('end') as SpeechSynthesisEvent);
    expect(FakeRecognition.instances).toHaveLength(1);
  });
  it('does not listen in a hidden document', () => {
    const { session } = setup();
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    session.start();
    expect(FakeRecognition.instances).toHaveLength(0);
    session.stop();
    vi.restoreAllMocks();
  });
});
