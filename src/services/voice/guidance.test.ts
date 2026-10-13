import { expect, it } from 'vitest';
import { microphoneLabel, nextQuestion } from './guidance';
import type { VoiceDraft } from './journey';

const draft: VoiceDraft = {
  kind: 'pickup',
  date: '2026-10-13',
  time: '',
  postcode: '',
};
it('asks for the next missing detail and prioritises uncertainty over completion', () => {
  expect(nextQuestion(draft, null, 0, false)).toBe(
    'What time does the flight land?',
  );
  expect(nextQuestion({ ...draft, kind: 'dropoff' }, null, 0, false)).toContain(
    'depart',
  );
  expect(nextQuestion({ ...draft, time: '18:30' }, null, 0, false)).toBe(
    'What is your starting postcode?',
  );
  const complete = { ...draft, time: '18:30', postcode: 'M1 4BT' };
  expect(nextQuestion(complete, { hour: true, basis: true }, 2, true)).toBe(
    'Is that AM or PM?',
  );
  expect(
    nextQuestion(complete, { hour: false, basis: true }, 2, true),
  ).toContain('landing time');
  expect(nextQuestion(complete, null, 2, false)).toBe('Which flight is yours?');
  expect(nextQuestion(complete, null, 0, false)).toContain('calculate');
  expect(nextQuestion(complete, null, 0, true)).toContain('change or ask');
});
it.each([
  ['idle', 'Start talking'],
  ['listening', 'Listening — stop'],
  ['thinking', 'Checking your journey…'],
  ['preparing', 'Interrupt and talk'],
  ['speaking', 'Interrupt and talk'],
] as const)('gives %s an actionable microphone label', (state, label) => {
  expect(microphoneLabel(state)).toBe(label);
});
