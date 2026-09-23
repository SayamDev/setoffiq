import type { RoadDisruptionSnapshot, RouteResult } from '../../domain/types';

const CORRIDOR_KM = 0.5;
const KM_PER_DEGREE_LATITUDE = 111.2;

/** Distance from a point to one routed road segment, in a local kilometre plane. */
function segmentDistanceKm(
  point: { latitude: number; longitude: number },
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const longitudeScale = KM_PER_DEGREE_LATITUDE * Math.cos((point.latitude * Math.PI) / 180);
  const ax = (a.longitude - point.longitude) * longitudeScale;
  const ay = (a.latitude - point.latitude) * KM_PER_DEGREE_LATITUDE;
  const bx = (b.longitude - point.longitude) * longitudeScale;
  const by = (b.latitude - point.latitude) * KM_PER_DEGREE_LATITUDE;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const fraction = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared));
  return Math.hypot(ax + fraction * dx, ay + fraction * dy);
}

/**
 * Proximity is evidence that an event may affect this drive, not measured delay.
 * Older snapshots and failed routing are left unconfirmed rather than guessed.
 */
export function matchDisruptionsToRoute(
  snapshot: RoadDisruptionSnapshot,
  route: RouteResult | null,
): RoadDisruptionSnapshot {
  const geometry = route?.geometry;
  return {
    ...snapshot,
    disruptions: snapshot.disruptions.map((entry) => {
      let routeMatch: 'on-route' | 'unconfirmed' = 'unconfirmed';
      const eventPoints = entry.coordinates?.length ? entry.coordinates : entry.coordinate ? [entry.coordinate] : [];
      if (eventPoints.length && geometry && geometry.length >= 2) {
        for (let index = 1; index < geometry.length; index += 1) {
          if (eventPoints.some((point) => segmentDistanceKm(point, geometry[index - 1]!, geometry[index]!) <= CORRIDOR_KM)) {
            routeMatch = 'on-route';
            break;
          }
        }
      }
      return { ...entry, routeMatch };
    }),
  };
}
