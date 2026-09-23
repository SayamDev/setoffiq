import type { RoadDisruption, RoadDisruptionSnapshot } from '../../domain/types';

const DUPLICATE_DISTANCE_KM = 0.25;

function roadNumber(road: string): string | null {
  return road.toUpperCase().match(/\b[AMB]\d{1,4}\b/)?.[0] ?? null;
}

function distanceKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const latitudeKm = (a.latitude - b.latitude) * 111.2;
  const longitudeKm = (a.longitude - b.longitude) * 111.2 * Math.cos((a.latitude * Math.PI) / 180);
  return Math.hypot(latitudeKm, longitudeKm);
}

/** Suppress likely cross-provider copies while retaining unrelated nearby events. */
export function mergeRoadDisruptions(snapshots: RoadDisruptionSnapshot[]): RoadDisruptionSnapshot {
  const disruptions: RoadDisruption[] = [];
  for (const snapshot of snapshots) {
    for (const entry of snapshot.disruptions) {
      const road = roadNumber(entry.road);
      const duplicate = road && entry.coordinate && disruptions.some((prior) =>
        prior.category === entry.category && prior.coordinate &&
        roadNumber(prior.road) === road &&
        distanceKm(prior.coordinate, entry.coordinate!) <= DUPLICATE_DISTANCE_KM);
      if (!duplicate) disruptions.push(entry);
    }
  }
  return {
    generatedAt: Math.min(...snapshots.map((item) => item.generatedAt)),
    source: snapshots.map((item) => item.source).join(', '),
    attribution: [...new Set(snapshots.map((item) => item.attribution))].join(' · '),
    searchRadiusKm: 40,
    disruptions,
  };
}
