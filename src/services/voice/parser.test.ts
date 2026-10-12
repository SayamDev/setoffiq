import { describe, expect, it } from 'vitest';
import { parseUtterance } from './parser';
const now = Date.parse('2026-10-12T12:00:00Z');
const parse = (text: string) => parseUtterance(text, now);
describe('journey language corpus', () => {
  it.each([
    [
      'I am picking someone up at 6:30 today, Ryanair from Rabat',
      '06:30',
      'pickup',
    ],
    ['collect my mum tomorrow at half six', '06:30', 'pickup'],
    ['pickup about half six in the evening', '18:30', 'pickup'],
    ['drop off for a flight departing at 19:15', '19:15', 'dropoff'],
    ['take her to the airport, flight leaves at seven pm', '19:00', 'dropoff'],
    ['no, 7 o’clock', '07:00', undefined],
    ['actually quarter to eight pm', '19:45', undefined],
    ['change to quarter past six am', '06:15', undefined],
    ['lands at six thirty pm', '18:30', undefined],
    ['landing at 18.30', '18:30', undefined],
    ['arrival time is midnight', '00:00', undefined],
    ['departure at noon', '12:00', 'dropoff'],
  ])('%s', (text, time, kind) => {
    const action = parse(text);
    expect(action.type).toBe('update');
    if (action.type !== 'update') return;
    expect(action.patch.time).toBe(time);
    expect(action.patch.kind).toBe(kind);
  });
  it.each(['why that time?', 'explain why', 'why should I leave then'])(
    'explanation: %s',
    (text) => expect(parse(text).type).toBe('explain'),
  );
  it.each(['start monitoring', 'monitor this journey', 'watch this flight'])(
    'monitor: %s',
    (text) => expect(parse(text).type).toBe('monitor'),
  );
  it.each(['stop', 'stop listening', 'cancel voice'])('stop: %s', (text) =>
    expect(parse(text).type).toBe('stop'),
  );
  it.each([
    'book a flight at 7',
    'pay for parking',
    'call my mum',
    '',
    'blah blah',
    'at 25:70',
    'at 18:99',
    'on February 30 at 7',
    'at 7 or 8',
    'today and tomorrow at 18:30',
    'not at 18:30 but at 19:00',
    'terminal four',
  ])('rejects: %s', (text) => expect(parse(text).type).toBe('clarify'));
  it('extracts the example without inventing a flight number', () => {
    expect(
      parse('I’m picking someone up at 6:30 today, Ryanair from Rabat'),
    ).toMatchObject({
      type: 'update',
      patch: {
        kind: 'pickup',
        time: '06:30',
        date: '2026-10-12',
        airline: 'Ryanair',
        place: 'Rabat',
      },
      ambiguousHour: true,
      ambiguousBasis: true,
    });
  });
  it.each([
    ['flight E K two one', 'EK21'],
    ['KL 1038', 'KL1038'],
    ['Ryanair one two three', 'FR123'],
    ['easyjet 456', 'U2456'],
    ['flight BA four zero six', 'BA406'],
  ])('flight: %s', (text, flightNumber) =>
    expect(parse(text)).toMatchObject({
      type: 'update',
      patch: { flightNumber },
    }),
  );
  it('asks AM/PM for the full tomorrow pickup', () =>
    expect(
      parse('I am picking someone up at 6:30 tomorrow, Ryanair from Rabat'),
    ).toMatchObject({ ambiguousHour: true }));
  it('finds the flight after an earlier time in a sentence', () =>
    expect(parse('landing tomorrow at 18:30, flight KL1038')).toMatchObject({
      type: 'update',
      patch: { flightNumber: 'KL1038', time: '18:30' },
    }));
  it('keeps approximation visible', () =>
    expect(parse('landing about half six')).toMatchObject({
      approximate: true,
      ambiguousBasis: false,
    }));
  it('recognises a meeting time as unsupported, rather than landing', () =>
    expect(parse('I need to be at the terminal at 7 pm')).toMatchObject({
      type: 'clarify',
    }));
  it.each(['tomorrow', 'the day after tomorrow', '2026-10-15'])(
    'date: %s',
    (text) => expect(parse(`landing ${text} at 18:30`).type).toBe('update'),
  );
  it('accepts privacy-sensitive location only into a structured field', () =>
    expect(parse('starting postcode M1 4BT')).toMatchObject({
      type: 'update',
      patch: { postcode: 'M1 4BT' },
    }));
});

it('keeps accented place names in the understood inputs', () =>
  expect(parseUtterance('landing at 18:30 from Málaga', now)).toMatchObject({
    type: 'update',
    patch: { place: 'Málaga' },
  }));
