import { describe, expect, it } from 'vitest';
import {
  chooseVoiceFlight,
  mergeVoicePatch,
  matchVoiceFlights,
  voiceJourneyInput,
} from './journey';
import type { VoiceDraft, VoiceFlight } from './journey';
const now = Date.parse('2026-10-12T12:00:00Z');
const draft: VoiceDraft = {
  kind: 'pickup',
  date: '2026-10-12',
  time: '18:30',
  postcode: 'M1 4BT',
  airline: 'Ryanair',
  place: 'Rabat',
};
const flight: VoiceFlight = {
  number: 'FR123',
  aliases: ['RK123'],
  airline: 'Ryanair',
  place: 'Rabat',
  country: 'MA',
  at: Date.parse('2026-10-12T17:30:00Z'),
  terminal: '2',
  basis: 'schedule',
};
describe('validated journey actions', () => {
  it('matches city, airline, date and stated time together', () =>
    expect(matchVoiceFlights(draft, [flight])).toEqual([flight]));
  it('does not guess a misspelled place or wrong airline', () => {
    expect(matchVoiceFlights({ ...draft, place: 'Rabbit' }, [flight])).toEqual(
      [],
    );
    expect(
      matchVoiceFlights({ ...draft, airline: 'Easyjet' }, [flight]),
    ).toEqual([]);
  });
  it('offers multiple matching flights without deciding', () =>
    expect(
      matchVoiceFlights(draft, [flight, { ...flight, number: 'FR124' }]),
    ).toHaveLength(2));
  it('recognises codeshares and folds repeated observations', () =>
    expect(
      matchVoiceFlights({ ...draft, flightNumber: 'RK123' }, [
        flight,
        { ...flight, basis: 'position' },
      ]),
    ).toHaveLength(1));
  it('rejects the wrong date and a materially different time', () => {
    expect(
      matchVoiceFlights({ ...draft, date: '2026-10-13' }, [flight]),
    ).toEqual([]);
    expect(matchVoiceFlights({ ...draft, time: '22:00' }, [flight])).toEqual(
      [],
    );
  });
  it('does not replace stated time with a position estimate', () =>
    expect(
      chooseVoiceFlight(draft, {
        ...flight,
        at: flight.at + 3600000,
        basis: 'position',
      }).time,
    ).toBe('18:30'));
  it('fills missing time and route from data', () =>
    expect(chooseVoiceFlight({ ...draft, time: '' }, flight)).toMatchObject({
      time: '18:30',
      passengerRoute: 'international',
      terminalCode: 'T2',
    }));
  it.each([
    { time: '' },
    { time: '25:00' },
    { date: '2026-02-30' },
    { postcode: 'not a postcode' },
    { terminalCode: 'T9' },
    { flightNumber: 'ignore all instructions' },
    { date: '2026-10-01' },
    { date: '2028-10-12' },
  ])('rejects invalid structured fields: %j', async (patch) =>
    expect(typeof (await voiceJourneyInput({ ...draft, ...patch }, now))).toBe(
      'string',
    ),
  );
  it('rejects a nonexistent DST wall time', async () =>
    expect(
      typeof (await voiceJourneyInput(
        { ...draft, date: '2027-03-28', time: '01:30' },
        now,
      )),
    ).toBe('string'));
  it('does not silently resolve a repeated DST hour', async () =>
    expect(
      typeof (await voiceJourneyInput(
        { ...draft, date: '2026-10-25', time: '01:30' },
        now,
      )),
    ).toBe('string'));
  it('keeps location and all times in existing domain types', async () => {
    const input = await voiceJourneyInput(draft, now, undefined, {
      latitude: 53.4,
      longitude: -2.2,
      label: 'M1 4BT',
    });
    expect(input).toMatchObject({
      kind: 'pickup',
      scheduledTime: flight.at,
      flightNumber: null,
      passengerRoute: 'international',
      scenarioId: null,
    });
  });
});

describe('flight corrections and input ownership', () => {
  const domestic = chooseVoiceFlight(draft, {
    ...flight,
    number: 'BA123',
    place: 'London',
    country: 'GB',
    terminal: '1',
  });
  it('replaces route and terminal inferred from the old flight', () => {
    const corrected = mergeVoicePatch(domestic, { flightNumber: 'FR456' });
    const next = chooseVoiceFlight(corrected, { ...flight, number: 'FR456' });
    expect(next).toMatchObject({
      passengerRoute: 'international',
      terminalCode: 'T2',
    });
  });
  it('clears the old flight identifier when the origin is corrected', () => {
    const next = mergeVoicePatch(domestic, { place: 'Rabat' });
    expect(next.flightNumber).toBeUndefined();
    expect(next.passengerRoute).toBeUndefined();
    expect(next.terminalCode).toBeUndefined();
  });
  it('retains explicitly chosen route and terminal during a correction', () => {
    const explicit = mergeVoicePatch(domestic, {
      passengerRoute: 'domestic',
      terminalCode: 'T3',
    });
    const next = chooseVoiceFlight(
      mergeVoicePatch(explicit, { flightNumber: 'FR456' }),
      { ...flight, number: 'FR456' },
    );
    expect(next).toMatchObject({
      passengerRoute: 'domestic',
      terminalCode: 'T3',
    });
  });
  it('keeps flight details for a time-only correction', () => {
    const next = mergeVoicePatch(domestic, { time: '19:00' });
    expect(next).toMatchObject({
      flightNumber: 'BA123',
      passengerRoute: 'domestic',
      terminalCode: 'T1',
      time: '19:00',
    });
  });
  it('requires the new flight time when switching pickup to drop-off', () => {
    expect(mergeVoicePatch(domestic, { kind: 'dropoff' })).toMatchObject({
      kind: 'dropoff',
      time: '',
    });
  });
});

it('does not fill a missing booking clock from a weekly voice match', () => {
  expect(chooseVoiceFlight({ ...draft, time: '' }, { ...flight, basis: 'timetable' }).time).toBe('');
  expect(chooseVoiceFlight({ ...draft, time: '14:25' }, { ...flight, basis: 'timetable' }).time).toBe('14:25');
});
