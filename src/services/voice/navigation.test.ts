import { expect, it } from 'vitest';
import { parseUtterance } from './parser';
it.each([
  ['help', { type: 'help' }],
  ['what can I say?', { type: 'help' }],
  ['repeat that', { type: 'repeat' }],
  ['say it again', { type: 'repeat' }],
  ['start again', { type: 'reset' }],
  ['new journey', { type: 'reset' }],
  ['edit my details', { type: 'edit' }],
  ['show details', { type: 'edit' }],
  ['go to home', { type: 'navigate', destination: 'home' }],
  ['open my journeys', { type: 'navigate', destination: 'journeys' }],
  ['open settings', { type: 'navigate', destination: 'settings' }],
])('recognises bounded conversational control: %s', (text, expected) => {
  expect(parseUtterance(text as string, Date.now())).toEqual(expected);
});
it.each([
  'do not open settings',
  'open settings and pay for parking',
  'open https://example.com',
  'delete my journeys',
])('does not execute unrecognised or compound navigation: %s', (text) => {
  expect(parseUtterance(text, Date.now()).type).toBe('clarify');
});
