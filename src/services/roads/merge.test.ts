import { describe, expect, it } from 'vitest';
import type { RoadDisruption, RoadDisruptionSnapshot } from '../../domain/types';
import { mergeRoadDisruptions } from './merge';

const event: RoadDisruption = {
  id: 'nh-1', road: 'M60', category: 'roadworks', description: 'Lane works',
  coordinate: { latitude: 53.40, longitude: -2.30 },
  distanceFromAirportKm: 6, startedAt: null, expectedEndAt: null, active: true,
};

function snapshot(source: string, disruptions: RoadDisruption[]): RoadDisruptionSnapshot {
  return { generatedAt: 1000, source, attribution: source, searchRadiusKm: 40, disruptions };
}

describe('cross-source road disruption merging', () => {
  it('shows the same roadwork reported by both feeds once', () => {
    const merged = mergeRoadDisruptions([
      snapshot('national-highways', [event]),
      snapshot('tomtom', [{ ...event, id: 'tomtom:2', coordinate: { latitude: 53.4005, longitude: -2.30 } }]),
    ]);
    expect(merged.disruptions).toHaveLength(1);
    expect(merged.attribution).toContain('tomtom');
  });

  it('keeps a different incident or a distinct work site on the same road', () => {
    const merged = mergeRoadDisruptions([
      snapshot('national-highways', [event]),
      snapshot('tomtom', [
        { ...event, id: 'accident', category: 'incident' },
        { ...event, id: 'farther-works', coordinate: { latitude: 53.405, longitude: -2.30 } },
      ]),
    ]);
    expect(merged.disruptions).toHaveLength(3);
  });
});
