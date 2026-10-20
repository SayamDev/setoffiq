import { describe, expect, it } from 'vitest';
import { cardMeta, describeRoute } from './routeText';

const uk = 'Europe/London';
// Sunday 27 September 2026, 08:15 in Manchester.
const departs = Date.UTC(2026, 8, 27, 7, 15);
const now = Date.UTC(2026, 8, 25, 16, 0);

describe('describing the other end of the flight', () => {
  it('gives a drop-off its destination and landing time in both clocks', () => {
    const text = describeRoute(
      {
        city: 'Rabat', iata: 'RBA', countryName: 'Morocco', timeZone: 'Etc/GMT-1',
        otherEndAt: departs + 190 * 60_000, durationMinutes: 190,
      },
      'dropoff',
      uk,
      now,
    );
    expect(text.headline).toBe('To Rabat (RBA), Morocco');
    // A fixed UTC+1 fixture tests same-clock wording independently of Morocco's
    // timezone rules, which differ between Node/ICU data versions.
    expect(text.detail).toBe(
      'Lands in Rabat about 11:25 on Sun 27 Sept — the same clock in Rabat and the UK, 3 hr 10 min in the air.',
    );
  });

  it('shows both clocks when they differ, and the day when it is not today', () => {
    const text = describeRoute(
      {
        city: 'Dubai', iata: 'DXB', countryName: 'United Arab Emirates', timeZone: 'Asia/Dubai',
        otherEndAt: Date.UTC(2026, 8, 25, 23, 40), durationMinutes: 435,
      },
      'pickup',
      uk,
      now,
    );
    expect(text.headline).toBe('From Dubai (DXB), United Arab Emirates');
    expect(text.detail).toBe(
      'Takes off from Dubai about 03:40 Dubai time (00:40 UK time on Sat 26 Sept), 7 hr 15 min in the air.',
    );
  });

  it('falls back to UK time alone when the other airport has no known timezone', () => {
    const text = describeRoute(
      { city: 'Lanzarote', iata: 'ACE', countryName: 'Spain', timeZone: null, otherEndAt: departs, durationMinutes: 250 },
      'dropoff',
      uk,
      departs,
    );
    expect(text.detail).toBe('Lands in Lanzarote about 08:15 UK time, 4 hr 10 min in the air.');
  });

  it('names only the place when no time can be worked out', () => {
    const text = describeRoute(
      { city: 'Belfast', iata: 'BFS', countryName: 'United Kingdom', timeZone: 'Europe/London', otherEndAt: null, durationMinutes: null },
      'dropoff',
      uk,
      now,
    );
    expect(text.headline).toBe('To Belfast (BFS)');
    expect(text.detail).toBeNull();
  });
});

describe('the line under the flight on the card', () => {
  it('names the place once, with both clocks only when they differ', () => {
    // Same fixed UTC+1 fixture: this asserts formatting, not Morocco's offset.
    expect(
      cardMeta(
        { city: 'Rabat', iata: 'RBA', timeZone: 'Etc/GMT-1', otherEndAt: departs + 200 * 60_000, durationMinutes: 200 },
        'dropoff',
        uk,
      ),
    ).toBe('Estimated arrival 11:35 Rabat time · 3 hr 20 min in the air');
    expect(
      cardMeta(
        { city: 'Dubai', iata: 'DXB', timeZone: 'Asia/Dubai', otherEndAt: Date.UTC(2026, 8, 25, 23, 40), durationMinutes: 435 },
        'pickup',
        uk,
      ),
    ).toBe('Estimated take-off 03:40 Dubai time (00:40 UK) · 7 hr 15 min in the air');
  });
});

describe('a flight number timetabled at a different time', () => {
  it('still says where it comes from, and flags the time entered', () => {
    const route = {
      city: 'Dubai', iata: 'DXB', countryName: 'United Arab Emirates', timeZone: 'Asia/Dubai',
      otherEndAt: null, durationMinutes: 465, timetabledAt: Date.UTC(2026, 8, 26, 6, 50),
    };
    expect(describeRoute(route, 'pickup', uk, now).headline).toBe('From Dubai (DXB), United Arab Emirates');
    expect(cardMeta(route, 'pickup', uk)).toBe(
      'Weekly timetable arrival: 07:50 Manchester time on Sat 26 Sept. It may not apply to your booking date. Your saved flight time is kept; use your airline booking.',
    );
  });
});
