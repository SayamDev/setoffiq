/**
 * Ground truth for measuring SetoffIQ's own accuracy.
 *
 * Nobody yet knows how far "on stand about 14:40" is typically out, or whether
 * a flight's usual lateness would improve a plan made hours ahead. Both need
 * the same thing: what actually happened, kept alongside what SetoffIQ could
 * see beforehand. This module keeps two records, and costs no extra requests:
 *
 * - **Landings**, from the AirLabs schedule the deploy job already fetches:
 *   scheduled time, the first estimate seen, and the actual time. A refresh
 *   every 4.5 hours with about 2.5 hours of look-back catches roughly half of
 *   all arrivals — plenty for averages, and said as such.
 * - **Approach samples**, from the adsb.lol snapshot: one position per
 *   arriving aircraft as it first comes within 300, 150 and 50 km, so the
 *   arrival estimate can later be replayed against the actual landing.
 *
 * Neither is shown in the app. They exist to be analysed, not to be believed.
 */

export const KEEP_DAYS = 28;
export const APPROACH_BANDS_KM = [300, 150, 50];
/** Samples this close in time belong to the same arrival. */
const SAME_ARRIVAL_HOURS = 6;

const DAY_MS = 86_400_000;

/**
 * Fold a schedule's arrivals into the landing record.
 *
 * Keyed on flight number and scheduled time, so the same arrival seen in
 * several refreshes is one entry. The first estimate is kept, not overwritten:
 * it is what a plan made early would have used.
 */
export function mergeLandings(previous, schedule, nowMs) {
  const landings = { ...(previous?.landings ?? {}) };
  const seenAt = Date.parse(schedule?.generatedAt ?? '') || nowMs;

  for (const flight of schedule?.arrivals ?? []) {
    if (!flight?.flight || typeof flight.scheduled !== 'number') continue;
    const key = `${flight.flight}@${flight.scheduled}`;
    const entry = landings[key] ?? {
      flight: flight.flight,
      callsign: flight.callsign ?? null,
      from: flight.otherEnd?.iata ?? null,
      terminal: flight.terminal ?? null,
      scheduled: flight.scheduled,
      firstEstimate: null,
      actual: null,
      status: null,
    };
    if (entry.firstEstimate === null && typeof flight.estimated === 'number' && flight.status !== 'landed') {
      entry.firstEstimate = { value: flight.estimated, seenAt };
    }
    if (flight.status === 'landed' && typeof flight.actual === 'number') entry.actual = flight.actual;
    if (flight.status) entry.status = flight.status;
    landings[key] = entry;
  }

  const cutoff = nowMs - KEEP_DAYS * DAY_MS;
  for (const [key, entry] of Object.entries(landings)) if (entry.scheduled < cutoff) delete landings[key];

  return {
    generatedAt: new Date(nowMs).toISOString(),
    keepDays: KEEP_DAYS,
    since: previous?.since ?? new Date(nowMs).toISOString().slice(0, 10),
    source: 'AirLabs /schedules, as already fetched by the deploy job',
    landings,
  };
}

/**
 * Note where each arriving aircraft was as it first crossed each distance band.
 *
 * Only aircraft whose reported route ends here: the same test the snapshot
 * uses to decide an aircraft is inbound.
 */
export function mergeApproachSamples(previous, aircraft, nowMs, airport, distanceKm) {
  const arrivals = (previous?.arrivals ?? []).map((entry) => ({ ...entry, samples: { ...entry.samples } }));

  for (const one of aircraft ?? []) {
    if (!one?.callsign || one.onGround || one.route?.to?.icao !== airport.icao) continue;
    const km = distanceKm(one);
    const band = APPROACH_BANDS_KM.filter((limit) => km <= limit).at(-1);
    if (band === undefined) continue;

    const callsign = one.callsign.trim().toUpperCase();
    let entry = arrivals.find(
      (candidate) => candidate.callsign === callsign && nowMs - candidate.firstSeen < SAME_ARRIVAL_HOURS * 3_600_000,
    );
    if (!entry) {
      entry = { callsign, from: one.route?.from?.icao ?? null, firstSeen: nowMs, samples: {} };
      arrivals.push(entry);
    }
    // The tightest band it is inside. An aircraft first seen at 120 km gets a
    // 150 km sample; its 300 km sample stays empty rather than invented.
    const key = String(band);
    if (!entry.samples[key]) {
      entry.samples[key] = {
        t: nowMs,
        km: Math.round(km * 10) / 10,
        groundSpeedMps: one.groundSpeedMps ?? null,
        baroAltitudeM: one.baroAltitudeM ?? null,
        verticalRateMps: one.verticalRateMps ?? null,
        trueTrackDeg: one.trueTrackDeg ?? null,
        latitude: one.latitude,
        longitude: one.longitude,
      };
    }
  }

  const cutoff = nowMs - KEEP_DAYS * DAY_MS;
  return {
    generatedAt: new Date(nowMs).toISOString(),
    keepDays: KEEP_DAYS,
    since: previous?.since ?? new Date(nowMs).toISOString().slice(0, 10),
    source: 'adsb.lol positions (ODbL 1.0), as already fetched by the deploy job',
    license: 'ODbL-1.0',
    bandsKm: APPROACH_BANDS_KM,
    arrivals: arrivals.filter((entry) => entry.firstSeen >= cutoff),
  };
}

/**
 * The previous record: the CI cache first, the published copy only if the
 * cache is missing. These files grow to a few megabytes, and fetching them
 * from the site every ten minutes would be traffic for nothing.
 */
export async function readPrevious({ cacheFile, localFile, url, isValid, readFile, fetch }) {
  for (const path of [cacheFile, localFile].filter(Boolean)) {
    try {
      const parsed = JSON.parse(await readFile(path, 'utf8'));
      if (isValid(parsed)) return parsed;
    } catch {
      // Not this one.
    }
  }
  try {
    const response = await fetch(`${url}?t=${Date.now()}`, { signal: AbortSignal.timeout(15_000) });
    if (response.ok) {
      const parsed = await response.json();
      if (isValid(parsed)) return parsed;
    }
  } catch {
    // Nothing to carry forward: start a new record.
  }
  return null;
}
