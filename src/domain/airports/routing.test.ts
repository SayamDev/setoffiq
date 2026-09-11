import { describe, expect, it } from 'vitest';
import { MANCHESTER, routingDestination } from './index';
import { haversineKm } from '../../services/geo';

/**
 * The aerodrome reference point sits in the middle of the airfield. Routing a
 * car to it snapped to the nearest service road and sent drivers through the
 * cargo centre — 20.2 miles and 44 minutes from Oldham, against 16.7 miles and
 * 24 minutes to the terminal approach. Every journey estimate in the app was
 * inflated by it.
 */
describe('where a car is routed to', () => {
  it('does not route to the aerodrome reference point', () => {
    const destination = routingDestination(MANCHESTER, null);
    expect(destination.latitude).not.toBe(MANCHESTER.latitude);
    expect(destination.longitude).not.toBe(MANCHESTER.longitude);
  });

  it('routes to the terminal the traveller named', () => {
    for (const terminal of MANCHESTER.terminals) {
      const destination = routingDestination(MANCHESTER, terminal.code);
      expect(destination.latitude).toBe(terminal.routingPoint.latitude);
      expect(destination.longitude).toBe(terminal.routingPoint.longitude);
      expect(destination.label).toContain(terminal.name);
    }
  });

  it('falls back to the general terminal approach when no terminal is given', () => {
    const destination = routingDestination(MANCHESTER, null);
    expect(destination.latitude).toBe(MANCHESTER.routingPoint.latitude);
    expect(destination.label).toBe(MANCHESTER.name);
  });

  it('ignores a terminal code the airport does not have', () => {
    const destination = routingDestination(MANCHESTER, 'T9');
    expect(destination.latitude).toBe(MANCHESTER.routingPoint.latitude);
  });

  it('keeps every routing point on the airport site', () => {
    // A typo here would silently send drivers somewhere else entirely, and the
    // symptom would look like a traffic problem rather than a data problem.
    const points = [MANCHESTER.routingPoint, ...MANCHESTER.terminals.map((t) => t.routingPoint)];
    for (const point of points) {
      const km = haversineKm(point, { latitude: MANCHESTER.latitude, longitude: MANCHESTER.longitude });
      expect(km).toBeLessThan(3);
    }
  });
});
