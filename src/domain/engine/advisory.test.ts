import { describe, expect, it } from 'vitest';
import { advisoryAt, buildPickupAdvisory, notificationTitle } from './advisory';
import type { PickupRecommendation } from '../types';

const ZONE = 'Europe/London';
const MINUTE = 60_000;
/** 16:18 BST on 11 September 2026 — the departure a live watch was sent at 16:54. */
const DEPARTURE = Date.UTC(2026, 8, 11, 15, 18);

function pickupAt(computedAt: number): PickupRecommendation {
  const readiness = { earliest: DEPARTURE + 45 * MINUTE, latest: DEPARTURE + 70 * MINUTE };
  return {
    kind: 'pickup',
    computedAt,
    recommendedDeparture: DEPARTURE,
    readiness: { window: readiness },
    advisory: buildPickupAdvisory(computedAt, DEPARTURE, readiness, ZONE),
  } as unknown as PickupRecommendation;
}

describe('advice as of now, not as of the last check', () => {
  it('moves on from "get ready" once the clock passes the departure', () => {
    const recommendation = pickupAt(DEPARTURE - 20 * MINUTE);
    expect(recommendation.advisory.kind).toBe('get-ready');

    // Twenty-six minutes later, with no check in between.
    const later = advisoryAt(recommendation, DEPARTURE + 6 * MINUTE, ZONE);
    expect(later.kind).toBe('running-late');
    expect(later.headline).toBe('Leave as soon as you can');
    expect(later.detail).toMatch(/was 6 min ago/);
  });

  it('does not tell someone to "leave at" a time that has gone', () => {
    const at1654 = advisoryAt(pickupAt(DEPARTURE), DEPARTURE + 36 * MINUTE, ZONE);
    expect(notificationTitle(at1654, DEPARTURE, ZONE)).toBe('Leave as soon as you can');
  });

  it('still names the time when there is time to spare', () => {
    const early = advisoryAt(pickupAt(DEPARTURE), DEPARTURE - 90 * MINUTE, ZONE);
    expect(notificationTitle(early, DEPARTURE, ZONE)).toBe('Leave at 16:18');
  });
});
