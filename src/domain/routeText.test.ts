import { describe, expect, it } from 'vitest';
import { describeRoute } from './routeText';

const uk = 'Europe/London';
// Sunday 27 September 2026, 08:15 in Manchester.
const departs = Date.UTC(2026, 8, 27, 7, 15);
const now = Date.UTC(2026, 8, 25, 16, 0);

describe('describing the other end of the flight', () => {
  it('gives a drop-off its destination and landing time in both clocks', () => {
    const text = describeRoute(
      {
        city: 'Rabat', iata: 'RBA', countryName: 'Morocco', timeZone: 'Africa/Casablanca',
        otherEndAt: departs + 190 * 60_000, durationMinutes: 190,
      },
      'dropoff',
      uk,
      now,
    );
    expect(text.headline).toBe('To Rabat (RBA), Morocco');
    // Morocco and the UK share a clock in late September.
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
