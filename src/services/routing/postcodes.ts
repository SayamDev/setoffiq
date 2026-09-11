import type { GeoPoint, Observed } from '../../domain/types';
import { readCache, writeCache } from '../cache';
import { fetchJson } from '../http';

const BASE = 'https://api.postcodes.io';
const CACHE_TTL_MINUTES = 60 * 24 * 90; // Postcode coordinates barely move.

export const POSTCODES_ATTRIBUTION =
  'Postcode data from postcodes.io, derived from ONS and Ordnance Survey open data (© Crown copyright and database right)';

interface PostcodeResult {
  postcode: string;
  latitude: number | null;
  longitude: number | null;
  admin_district: string | null;
  country: string | null;
}

interface PostcodeResponse {
  status: number;
  result: PostcodeResult | null;
}

/** UK postcode shape, deliberately permissive about spacing and case. */
const POSTCODE_PATTERN = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;
const OUTCODE_PATTERN = /^[A-Z]{1,2}\d[A-Z\d]?$/i;

export function normalisePostcode(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, '');
}

export function isValidPostcodeShape(input: string): boolean {
  const value = normalisePostcode(input);
  return POSTCODE_PATTERN.test(value) || OUTCODE_PATTERN.test(value);
}

/** "m14bt" and "M1 4BT" both come back as "M1 4BT", never "M1  4BT". */
function prettyPostcode(value: string): string {
  const compact = normalisePostcode(value);
  if (compact.length <= 4) return compact;
  return `${compact.slice(0, -3)} ${compact.slice(-3)}`;
}

/**
 * UK postcode lookup only.
 *
 * SetoffIQ deliberately does not build free-text address search: the open
 * geocoder that would make that possible (Nominatim) prohibits client-side
 * autocomplete in its usage policy. A postcode is one request, on submit,
 * cached afterwards — which is well inside what a free service should be
 * asked to do. postcodes.io is MIT-licensed, needs no key and has no billing
 * mechanism. Verified 10 September 2026 — see DATA-SOURCES.md.
 */
export async function geocodePostcode(
  input: string,
  signal?: AbortSignal,
): Promise<Observed<GeoPoint>> {
  const now = Date.now();
  const value = normalisePostcode(input);

  if (!isValidPostcodeShape(value)) {
    return {
      state: 'unavailable',
      value: null,
      fetchedAt: null,
      observedAt: null,
      provider: 'postcodes-io',
      attribution: POSTCODES_ATTRIBUTION,
      message: "That doesn't look like a UK postcode. Try something like M1 4BT.",
    };
  }

  const isOutcode = OUTCODE_PATTERN.test(value);
  const key = `postcode:${value}`;
  const cached = readCache<GeoPoint>(key, CACHE_TTL_MINUTES, now);
  if (cached?.fresh) {
    return {
      state: 'ok',
      value: cached.value,
      fetchedAt: cached.storedAt,
      observedAt: null,
      provider: 'postcodes-io',
      attribution: POSTCODES_ATTRIBUTION,
      message: null,
    };
  }

  const url = isOutcode ? `${BASE}/outcodes/${value}` : `${BASE}/postcodes/${value}`;

  try {
    const payload = await fetchJson<PostcodeResponse>(url, {
      provider: 'postcodes-io',
      endpoint: isOutcode ? 'outcodes' : 'postcodes',
      signal,
    });
    const result = payload.result;
    if (!result || result.latitude === null || result.longitude === null) {
      throw new Error('no coordinates');
    }
    const point: GeoPoint = {
      latitude: result.latitude,
      longitude: result.longitude,
      label: prettyPostcode(result.postcode ?? value),
    };
    writeCache(key, point, now);
    return {
      state: 'ok',
      value: point,
      fetchedAt: now,
      observedAt: null,
      provider: 'postcodes-io',
      attribution: POSTCODES_ATTRIBUTION,
      message: null,
    };
  } catch {
    if (cached) {
      return {
        state: 'stale',
        value: cached.value,
        fetchedAt: cached.storedAt,
        observedAt: null,
        provider: 'postcodes-io',
        attribution: POSTCODES_ATTRIBUTION,
        message: 'Using a saved location for this postcode.',
      };
    }
    return {
      state: 'unavailable',
      value: null,
      fetchedAt: null,
      observedAt: null,
      provider: 'postcodes-io',
      attribution: POSTCODES_ATTRIBUTION,
      message: "We couldn't look up that postcode. Check it and try again.",
    };
  }
}
