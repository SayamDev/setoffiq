/* eslint-disable unicorn/prefer-add-event-listener -- Each recognition instance is privately owned; handlers are detached on pause. */
/** Minimal browser seam; no recordings, logging, storage, model calls or analytics. */
interface SpeechResult {
  isFinal: boolean;
  0: { transcript: string };
}
export interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult:
    | ((event: {
        resultIndex: number;
        results: ArrayLike<SpeechResult>;
      }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start(): void;
  abort(): void;
}
interface SpeechWindow {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
}
export function recognitionConstructor(): (new () => Recognition) | undefined {
  const browser = window as Window & SpeechWindow;
  return browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
}
export type SpeechState = 'idle' | 'listening' | 'thinking' | 'speaking';
export interface SpeechCallbacks {
  state(state: SpeechState): void;
  transcript(text: string): void;
  final(text: string): void;
  message(text: string): void;
}

/** Half duplex avoids interpreting the speaker as a new user command.
 * Tap Listen to interrupt output. Auto-resume enables hands-free follow-ups.
 * Permission failures and silence stop instead of creating an endless retry loop. */
export class VoiceSpeech {
  private recognition: Recognition | null = null;
  private enabled = false;
  private speaking = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;
  constructor(private callbacks: SpeechCallbacks) {}
  start(): void {
    this.stop();
    this.enabled = true;
    this.listen();
  }
  private listen(): void {
    if (!this.enabled || this.speaking || document.hidden) return;
    const Constructor = recognitionConstructor();
    if (!Constructor) {
      this.stop();
      this.callbacks.message(
        'Speech recognition is unavailable here. Type the same instructions below.',
      );
      return;
    }
    const recognition = new Constructor();
    this.recognition = recognition;
    recognition.lang = 'en-GB';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onstart = () => {
      if (this.recognition === recognition) this.callbacks.state('listening');
    };
    recognition.onresult = (event) => {
      if (this.recognition !== recognition || !this.enabled) return;
      let interim = '';
      const finals: string[] = [];
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i]!;
        if (result.isFinal) finals.push(result[0].transcript);
        else interim += `${result[0].transcript} `;
      }
      // Results contain the full current session, including earlier final segments.
      // Do not abort a sentence while the service is still transcribing its tail.
      this.callbacks.transcript(
        [...finals, interim.trim()].filter(Boolean).join(' '),
      );
      if (finals.length && !interim.trim()) {
        // One complete utterance per action; stop capturing while it is interpreted.
        this.pause();
        this.callbacks.state('thinking');
        this.callbacks.final(finals.join(' '));
      }
    };
    recognition.onerror = (event) => {
      if (this.recognition !== recognition) return;
      this.stop();
      const message =
        event.error === 'not-allowed' || event.error === 'service-not-allowed'
          ? 'Microphone permission was denied. Use typed input, or enable microphone access in your browser.'
          : event.error === 'no-speech'
            ? 'No speech heard. Tap Listen to try again, or type below.'
            : 'Speech recognition stopped. Check your microphone and connection, or type below.';
      this.callbacks.message(message);
    };
    recognition.onend = () => {
      if (this.recognition !== recognition) return;
      this.recognition = null;
      // Browser session boundaries are normal. A bounded silence timer remains active.
      if (this.enabled) this.listen();
    };
    if (!this.timer)
      this.timer = setTimeout(() => {
        this.stop();
        this.callbacks.message(
          'Voice paused after a minute without an instruction. Tap Listen to resume.',
        );
      }, 60000);
    try {
      recognition.start();
    } catch {
      this.stop();
      this.callbacks.message(
        'Could not start listening. Tap Listen again, or type below.',
      );
    }
  }
  private pause(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const recognition = this.recognition;
    this.recognition = null;
    if (recognition) {
      recognition.onend = null;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onstart = null;
      recognition.abort();
    }
  }
  wait(): void {
    this.pause();
    this.generation++;
    this.speaking = false;
    window.speechSynthesis?.cancel();
    this.callbacks.state('thinking');
  }
  say(text: string, force = false): void {
    this.pause();
    const token = ++this.generation;
    window.speechSynthesis?.cancel();
    // Use local voices only. If absent, the result is still shown on screen.
    const voice = window.speechSynthesis
      ?.getVoices()
      .find(
        (candidate) =>
          candidate.localService && candidate.lang.startsWith('en'),
      );
    if ((!this.enabled && !force) || !voice || document.hidden) {
      this.speaking = false;
      this.callbacks.state('idle');
      if (this.enabled) this.listen();
      return;
    }
    this.speaking = true;
    this.callbacks.state('speaking');
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voice;
    utterance.lang = voice.lang;
    const finish = () => {
      if (token !== this.generation) return;
      this.speaking = false;
      this.callbacks.state('idle');
      this.listen();
    };
    utterance.onend = finish;
    utterance.onerror = finish;
    window.speechSynthesis.speak(utterance);
  }
  stop(): void {
    this.enabled = false;
    this.speaking = false;
    this.generation++;
    this.pause();
    window.speechSynthesis?.cancel();
    this.callbacks.state('idle');
  }
}
