import { describe, expect, it } from 'vitest';
import { earliestSelectableDate, validateScheduledTime, impliedDate } from './scheduleWindow';
import { HOUR_MS } from './time';
import { manTime } from '../test/factories';

const NOW = manTime(12, 0);
const hours = (n: number): number => n * HOUR_MS;

describe('which times are worth planning around', () => {
  it('accepts a future arrival and a future departure', () => {
    expect(validateScheduledTime('pickup', NOW + hours(3), NOW)).toBeNull();
    expect(validateScheduledTime('dropoff', NOW + hours(3), NOW)).toBeNull();
  });

  it('accepts an arrival that has just happened', () => {
    // The premise of the product: a passenger who landed twenty minutes ago is
    // still somewhere between the aircraft and the kerb, and when to leave is
    // exactly the question worth answering.
    expect(validateScheduledTime('pickup', NOW - 20 * 60_000, NOW)).toBeNull();
    expect(validateScheduledTime('pickup', NOW - hours(5), NOW)).toBeNull();
  });

  it('rejects an arrival long enough ago that the passenger is gone', () => {
    const problem = validateScheduledTime('pickup', NOW - hours(9), NOW);
    expect(problem?.message).toMatch(/more than six hours ago/i);
  });

  it('rejects a departure that has already gone', () => {
    // Unlike an arrival, there is nothing left to plan: the aircraft has left.
    const problem = validateScheduledTime('dropoff', NOW - hours(1), NOW);
    expect(problem?.message).toMatch(/already passed/i);
  });

  it('tolerates a few minutes of clock skew on a departure', () => {
    expect(validateScheduledTime('dropoff', NOW - 2 * 60_000, NOW)).toBeNull();
  });

  it('rejects a date more than a year out, which is usually a mistyped year', () => {
    const problem = validateScheduledTime('pickup', NOW + hours(24 * 400), NOW);
    expect(problem?.message).toMatch(/more than a year away/i);
  });

  it('offers a date floor that matches the rule for each journey kind', () => {
    const zone = 'Europe/London';
    // A drop-off cannot be before today; a pickup can reach back into the
    // previous day when the look-back window crosses midnight.
    const justAfterMidnight = manTime(0, 30);
    expect(earliestSelectableDate('dropoff', justAfterMidnight, zone)).toBe(
      earliestSelectableDate('dropoff', justAfterMidnight, zone),
    );
    expect(
      earliestSelectableDate('pickup', justAfterMidnight, zone) <
        earliestSelectableDate('dropoff', justAfterMidnight, zone),
    ).toBe(true);
  });
});

describe('the date a bare time most likely means', () => {
  // 19:00 BST on Friday 11 September 2026.
  const at1900 = Date.UTC(2026, 8, 11, 18, 0);
  const zone = 'Europe/London';

  it('takes an arrival at 01:05 typed at 19:00 as tomorrow morning', () => {
    expect(impliedDate('pickup', '01:05', at1900, zone)).toEqual({ date: '2026-09-12', tomorrow: true });
  });

  it('keeps a pickup that landed an hour ago on today', () => {
    expect(impliedDate('pickup', '18:00', at1900, zone)).toEqual({ date: '2026-09-11', tomorrow: false });
  });

  it('keeps anything later today on today', () => {
    expect(impliedDate('pickup', '23:40', at1900, zone)).toEqual({ date: '2026-09-11', tomorrow: false });
  });

  it('moves a departure that has already gone to tomorrow', () => {
    expect(impliedDate('dropoff', '18:30', at1900, zone)).toEqual({ date: '2026-09-12', tomorrow: true });
  });

  it('leaves an unreadable time alone', () => {
    expect(impliedDate('pickup', '', at1900, zone)).toEqual({ date: '2026-09-11', tomorrow: false });
  });
});
