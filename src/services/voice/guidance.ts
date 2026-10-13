import type { VoiceDraft } from './journey';
import type { SpeechState } from './speech';
import { isValidPostcodeShape } from '../routing';

/** UI guidance only; never computes a journey number. */
export function nextQuestion(
  draft: VoiceDraft,
  ambiguity: { hour: boolean; basis: boolean } | null,
  choices: number,
  ready: boolean,
): string {
  if (ambiguity?.hour) return 'Is that AM or PM?';
  if (ambiguity?.basis) return 'Is that the flight landing time?';
  if (choices) return 'Which flight is yours?';
  if (!draft.time)
    return draft.kind === 'pickup'
      ? 'What time does the flight land?'
      : 'What time does the flight depart?';
  if (!isValidPostcodeShape(draft.postcode))
    return 'What is your starting postcode?';
  return ready
    ? 'What would you like to change or ask?'
    : 'Check your details, then calculate your plan.';
}

export function microphoneLabel(state: SpeechState): string {
  switch (state) {
    case 'listening':
      return 'Listening — stop';
    case 'thinking':
      return 'Checking your journey…';
    case 'preparing':
    case 'speaking':
      return 'Interrupt and talk';
    default:
      return 'Start talking';
  }
}
