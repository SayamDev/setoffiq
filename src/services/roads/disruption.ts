import type {
  AirportProfile,
  Observed,
  RoadDisruption,
  RoadDisruptionSnapshot,
} from '../../domain/types';
import { readCache, writeCache } from '../cache';
import { fetchJson } from '../http';

const SNAPSHOT_PATH = 'data/roads/EGCC-disruption.json';
const CACHE_KEY = 'road-disruption:EGCC';
const CACHE_TTL_MINUTES = 10;
/** Beyond this the disruption is unlikely to be on any sensible route in. */
const RELEVANT_RADIUS_KM = 40;

function snapshotUrl(): string {
  const base = import.meta.env.BASE_URL ?? '/';
  return `${base}${SNAPSHOT_PATH}`.replace(/([^:]\/)\/+/g, '$1');
}

/**
 * Road disruption near the airport, via a static snapshot.
 *
 * **This is inert unless a key has been configured.** Every free source for UK
 * road disruption requires registration — National Highways' closures feed,
 * Street Manager and TfGM all return 401 without one, and the old National
 * Highways RSS feed now 404s (all verified 11 September 2026). A key is
 * perfectly compatible with this project's rules as long as it lives in
 * repository secrets and is used by the scheduled job, so that the browser
 * never sees it and no visitor is ever asked for one.
 *
 * Until such a key exists the snapshot file is simply absent, this provider
 * reports `unavailable`, and the recommendation is exactly what it was before.
 * Nothing here fabricates a disruption, and the absence of data is never
 * presented as an absence of disruption.
 */
export const roadDisruptionProvider = {
  id: 'road-disruption',
  label: 'Road disruption',

  async getDisruption(
    airport: AirportProfile,
    signal?: AbortSignal,
  ): Promise<Observed<RoadDisruptionSnapshot>> {
    const now = Date.now();
    const cached = readCache<RoadDisruptionSnapshot>(CACHE_KEY, CACHE_TTL_MINUTES, now);

    let snapshot = cached?.fresh ? cached.value : null;
    let fetchedAt = cached?.fresh ? cached.storedAt : null;

    if (!snapshot) {
      try {
        snapshot = await fetchJson<RoadDisruptionSnapshot>(snapshotUrl(), {
          provider: 'road-disruption',
          endpoint: 'disruption',
          // The file legitimately does not exist when no key is configured, so
          // a 404 must not be retried.
          retries: 0,
          signal,
        });
        fetchedAt = now;
        writeCache(CACHE_KEY, snapshot, now);
      } catch {
        if (cached) {
          snapshot = cached.value;
          fetchedAt = cached.storedAt;
        }
      }
    }

    if (!snapshot) {
      return {
        state: 'unavailable',
        value: null,
        fetchedAt: null,
        observedAt: null,
        provider: 'road-disruption',
        attribution: null,
        message:
          'SetoffIQ has no source for live road disruption, so none is reflected in this estimate.',
      };
    }

    const ageMinutes = Math.round((now - snapshot.generatedAt) / 60_000);
    return {
      state: ageMinutes > 60 ? 'stale' : 'ok',
      value: {
        ...snapshot,
        disruptions: relevantTo(snapshot.disruptions, airport),
      },
      fetchedAt,
      observedAt: snapshot.generatedAt,
      provider: 'road-disruption',
      attribution: snapshot.attribution,
      message: null,
    };
  },
};

/** Active disruptions close enough to plausibly sit on a route to the airport. */
export function relevantTo(
  disruptions: RoadDisruption[],
  _airport: AirportProfile,
): RoadDisruption[] {
  return disruptions
    .filter((entry) => entry.active && entry.distanceFromAirportKm <= RELEVANT_RADIUS_KM)
    .sort((a, b) => a.distanceFromAirportKm - b.distanceFromAirportKm);
}

/**
 * How much a set of disruptions should widen the journey estimate.
 *
 * Deliberately conservative, and an assumption rather than a measurement: a
 * closure somewhere near the route is a reason to allow more time, not a
 * basis for claiming to know how much longer the drive will take.
 */
export function disruptionUncertainty(disruptions: RoadDisruption[]): number {
  if (disruptions.length === 0) return 0;
  const closures = disruptions.filter((entry) => entry.category === 'closure').length;
  if (closures > 0) return 0.2;
  return disruptions.length > 2 ? 0.12 : 0.06;
}
