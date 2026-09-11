import type { SnapshotAircraft } from '../../src/services/flight/snapshotTypes';

export function haversineKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number;

export function toSnapshotAircraft(
  ac: Record<string, unknown>,
  nowMs: number,
  airport: { latitude: number; longitude: number },
  radiusKm: number,
): Omit<SnapshotAircraft, 'route'> | null;
