import type { SnapshotAircraft } from '../../src/services/flight/snapshotTypes';

export function haversineKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number;

export const NEAR_RADIUS_KM: number;

export function keepInSnapshot(
  aircraft: Pick<SnapshotAircraft, 'baroAltitudeM' | 'route'>,
  distanceKm: number,
  airportIcao: string,
): boolean;

export function toSnapshotAircraft(
  ac: Record<string, unknown>,
  nowMs: number,
  airport: { latitude: number; longitude: number },
  radiusKm: number,
): Omit<SnapshotAircraft, 'route'> | null;
