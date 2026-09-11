#!/usr/bin/env node
/**
 * Fetch a snapshot of aircraft positions near Manchester Airport from The
 * OpenSky Network and write it as a static JSON file.
 *
 * Why this exists: OpenSky's REST API responds with
 * `access-control-allow-origin: https://opensky-network.org`, so a browser on
 * any other origin cannot call it. Rather than run a proxy server — which would
 * mean infrastructure, and a bill — this runs on a schedule in GitHub Actions
 * and commits the result next to the app, where the browser can read it from
 * its own origin.
 *
 * It calls the anonymous endpoint, which OpenSky documents as 400 credits a
 * day. A bounding box of this size costs a small number of credits per call, so
 * running four times an hour stays well inside that. No credentials are used,
 * and there is no billing mechanism to trip.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUTPUT = resolve(HERE, '../public/data/flights/EGCC-arrivals.json');

const AIRPORT = { icao: 'EGCC', latitude: 53.3537, longitude: -2.275 };

// Roughly 300 km around Manchester: far enough to see arrivals on descent,
// small enough to keep the response and the credit cost modest.
const BOX = { lamin: 50.9, lamax: 55.8, lomin: -6.5, lomax: 1.8 };
const RADIUS_KM = 300;

const ATTRIBUTION = 'Aircraft position data from The OpenSky Network (opensky-network.org)';

function haversineKm(a, b) {
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const deltaLat = toRadians(b.latitude - a.latitude);
  const deltaLon = toRadians(b.longitude - a.longitude);
  const h =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(deltaLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * OpenSky state vectors are positional arrays. The indices are fixed by the
 * API and documented at https://openskynetwork.github.io/opensky-api/rest.html.
 */
function toAircraft(state) {
  const [icao24, callsign, , , lastContact, longitude, latitude, baroAltitude, onGround, velocity, trueTrack, verticalRate, , geoAltitude] = state;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return null;
  const name = (callsign ?? '').trim();
  if (!name) return null;

  const distanceKm = haversineKm({ latitude, longitude }, AIRPORT);
  if (distanceKm > RADIUS_KM) return null;

  // Aircraft cruising far above the airport are overflights, not arrivals.
  if (typeof baroAltitude === 'number' && baroAltitude > 12000 && distanceKm > 120) return null;

  return {
    callsign: name,
    icao24,
    latitude: Number(latitude.toFixed(4)),
    longitude: Number(longitude.toFixed(4)),
    baroAltitudeM: typeof baroAltitude === 'number' ? Math.round(baroAltitude) : null,
    geoAltitudeM: typeof geoAltitude === 'number' ? Math.round(geoAltitude) : null,
    groundSpeedMps: typeof velocity === 'number' ? Math.round(velocity) : null,
    verticalRateMps: typeof verticalRate === 'number' ? Number(verticalRate.toFixed(1)) : null,
    // Without it, an aircraft passing Manchester on its way to Birmingham is
    // indistinguishable from one arriving here.
    trueTrackDeg: typeof trueTrack === 'number' ? Math.round(trueTrack) : null,
    onGround: Boolean(onGround),
    lastContact: typeof lastContact === 'number' ? lastContact : Math.floor(Date.now() / 1000),
  };
}

async function main() {
  const url = `https://opensky-network.org/api/states/all?lamin=${BOX.lamin}&lomin=${BOX.lomin}&lamax=${BOX.lamax}&lomax=${BOX.lomax}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);

  let aircraft = [];
  let ok = false;
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`OpenSky responded ${response.status}`);
    const payload = await response.json();
    aircraft = (payload.states ?? []).map(toAircraft).filter(Boolean);
    ok = true;
  } catch (error) {
    // A failed run must not overwrite a good snapshot with an empty one.
    console.error(`Snapshot failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
    return;
  } finally {
    clearTimeout(timeout);
  }

  const snapshot = {
    generatedAt: new Date().toISOString(),
    airportIcao: AIRPORT.icao,
    source: 'The OpenSky Network — /states/all (anonymous)',
    attribution: ATTRIBUTION,
    radiusKm: RADIUS_KM,
    aircraft,
  };

  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`Wrote ${aircraft.length} aircraft to ${OUTPUT} (ok=${ok})`);
}

await main();
