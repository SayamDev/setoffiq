import { describe, expect, it } from 'vitest';
import type { RoadDisruptionSnapshot, RouteResult } from '../../domain/types';
import { matchDisruptionsToRoute } from './routeMatch';

const route: RouteResult = {
  durationSeconds: 1800,
  distanceMeters: 20_000,
  trafficAware: false,
  estimatedWithoutRouting: false,
  geometry: [
    { latitude: 53.34, longitude: -2.40 },
    { latitude: 53.35, longitude: -2.30 },
    { latitude: 53.36, longitude: -2.27 },
  ],
};

function snapshot(coordinate?: { latitude: number; longitude: number }): RoadDisruptionSnapshot {
  return {
    generatedAt: 1000,
    source: 'test',
    attribution: 'test',
    searchRadiusKm: 40,
    disruptions: [{
      id: 'one', road: 'M56', category: 'closure', description: 'Road closed',
      distanceFromAirportKm: 5, startedAt: 0, expectedEndAt: null, active: true,
      coordinate,
    }],
  };
}

describe('road disruption route matching', () => {
  it('recognises a location on a route segment, including between vertices', () => {
    const result = matchDisruptionsToRoute(snapshot({ latitude: 53.345, longitude: -2.35 }), route);
    expect(result.disruptions[0]?.routeMatch).toBe('on-route');
  });

  it('does not treat an event near the airport but away from the route as affecting this drive', () => {
    const result = matchDisruptionsToRoute(snapshot({ latitude: 53.41, longitude: -2.30 }), route);
    expect(result.disruptions[0]?.routeMatch).toBe('unconfirmed');
  });

  it('matches a point along an incident line even when its representative point is elsewhere', () => {
    const incident = snapshot({ latitude: 53.41, longitude: -2.30 });
    incident.disruptions[0]!.coordinates = [
      { latitude: 53.41, longitude: -2.30 },
      { latitude: 53.345, longitude: -2.35 },
    ];
    expect(matchDisruptionsToRoute(incident, route).disruptions[0]?.routeMatch).toBe('on-route');
  });

  it('does not guess when routing or older snapshot geometry is absent', () => {
    expect(matchDisruptionsToRoute(snapshot(), route).disruptions[0]?.routeMatch).toBe('unconfirmed');
    expect(matchDisruptionsToRoute(snapshot({ latitude: 53.345, longitude: -2.35 }), null).disruptions[0]?.routeMatch).toBe('unconfirmed');
  });
});
