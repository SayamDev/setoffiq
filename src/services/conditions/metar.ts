import type {
  AirportConditions,
  AirportConditionsProvider,
  AirportProfile,
  Observed,
} from '../../domain/types';
import { readCache, writeCache } from '../cache';
import { fetchJson } from '../http';

export const AWC_ATTRIBUTION =
  'Aerodrome observations from the NOAA Aviation Weather Center (aviationweather.gov)';

const SNAPSHOT_PATH = 'data/airport/EGCC-conditions.json';
const CACHE_KEY = 'airport-conditions:EGCC';
const CACHE_TTL_MINUTES = 10;

/** The shape the snapshot job writes: a trimmed, normalised observation. */
export interface ConditionsSnapshot {
  generatedAt: string;
  icaoCode: string;
  source: string;
  attribution: string;
  conditions: AirportConditions | null;
}

function snapshotUrl(): string {
  const base = import.meta.env.BASE_URL ?? '/';
  return `${base}${SNAPSHOT_PATH}`.replace(/([^:]\/)\/+/g, '$1');
}

/**
 * Airport conditions, via a static snapshot.
 *
 * The Aviation Weather Center serves METAR and TAF for any ICAO code, free and
 * without a key, but sends no `access-control-allow-origin` header — verified
 * 11 September 2026 — so a browser on another origin cannot call it. The same
 * scheduled job that publishes aircraft positions fetches it and writes the
 * result next to the app.
 *
 * What this adds over the general forecast: it describes the aerodrome rather
 * than a point ten miles away, in the terms that actually govern arrival
 * rates. What it does not do is predict a delay — low visibility makes one
 * more likely, and SetoffIQ says that rather than implying it knows.
 */
export const metarConditionsProvider: AirportConditionsProvider = {
  id: 'airport-conditions',
  label: 'Aviation Weather Center',
  attribution: AWC_ATTRIBUTION,

  async getConditions(airport: AirportProfile, signal): Promise<Observed<AirportConditions>> {
    const now = Date.now();
    const cached = readCache<ConditionsSnapshot>(CACHE_KEY, CACHE_TTL_MINUTES, now);

    let snapshot = cached?.fresh ? cached.value : null;
    let fetchedAt = cached?.fresh ? cached.storedAt : null;

    if (!snapshot) {
      try {
        snapshot = await fetchJson<ConditionsSnapshot>(snapshotUrl(), {
          provider: 'airport-conditions',
          endpoint: 'metar',
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

    const unavailable: Observed<AirportConditions> = {
      state: 'unavailable',
      value: null,
      fetchedAt: null,
      observedAt: null,
      provider: 'airport-conditions',
      attribution: AWC_ATTRIBUTION,
      message: "We couldn't check conditions at the airport.",
    };

    if (!snapshot?.conditions) return unavailable;
    if (snapshot.icaoCode !== airport.icaoCode) return unavailable;

    const observedAt = snapshot.conditions.observedAt;
    const ageMinutes = Math.round((now - observedAt) / 60_000);
    // Aerodrome observations are issued roughly hourly, so "stale" is a looser
    // idea here than it is for an aircraft position.
    const stale = ageMinutes > 120;

    return {
      state: stale ? 'stale' : 'ok',
      value: snapshot.conditions,
      fetchedAt,
      observedAt,
      provider: 'airport-conditions',
      attribution: AWC_ATTRIBUTION,
      message: stale ? `The last aerodrome observation is ${ageMinutes} minutes old.` : null,
    };
  },
};
