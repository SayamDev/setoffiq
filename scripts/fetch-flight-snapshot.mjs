#!/usr/bin/env node
/**
 * Fetch a snapshot of aircraft near Manchester Airport from adsb.lol, add each
 * one's reported route, and write it as a static JSON file.
 *
 * Why adsb.lol: it is free and keyless, and everything it publishes is under
 * the Open Database Licence (ODbL 1.0), which permits exactly this —
 * republishing with attribution. The OpenSky Network, used before it, requires
 * a written agreement for any operational use of its REST API.
 *
 * Why a scheduled job at all: the browser reads one static file from the app's
 * own origin, so no visitor ever calls a third party for flight data, and the
 * request count is fixed (about four an hour) however many people use the site.
 *
 * Routes come from the Virtual Radar Server standing data (CC0), cloned by the
 * deploy job into STANDING_DATA_DIR. Without it, routes are simply unknown.
 *
 * The published file is a derived database of adsb.lol data and is therefore
 * itself offered under ODbL 1.0.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toSnapshotAircraft } from './lib/adsblol.mjs';
import { createRouteLookup } from './lib/routes.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUTPUT = resolve(HERE, '../public/data/flights/EGCC-arrivals.json');

const AIRPORT = { icao: 'EGCC', latitude: 53.3537, longitude: -2.275 };
const RADIUS_KM = 300;
/** adsb.lol takes the radius in nautical miles, up to 250. */
const RADIUS_NM = Math.round(RADIUS_KM / 1.852);

const ATTRIBUTION = 'Aircraft data from adsb.lol, licensed under ODbL 1.0';
const ROUTES_ATTRIBUTION = 'Reported routes from the Virtual Radar Server standing data (CC0)';

async function main() {
  const url = `https://api.adsb.lol/v2/point/${AIRPORT.latitude}/${AIRPORT.longitude}/${RADIUS_NM}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);

  let payload;
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'user-agent': 'SetoffIQ snapshot job (https://github.com/SayamDev/setoffiq)' },
    });
    if (!response.ok) throw new Error(`adsb.lol responded ${response.status}`);
    payload = await response.json();
    if (!Array.isArray(payload.ac)) throw new Error('adsb.lol response had no aircraft list');
  } catch (error) {
    // A failed run must not overwrite a good snapshot with an empty one.
    console.error(`Snapshot failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
    return;
  } finally {
    clearTimeout(timeout);
  }

  const nowMs = typeof payload.now === 'number' ? payload.now : Date.now();
  const routes = createRouteLookup(process.env.STANDING_DATA_DIR);

  const aircraft = payload.ac
    .map((ac) => toSnapshotAircraft(ac, nowMs, AIRPORT, RADIUS_KM))
    .filter(Boolean)
    .map((entry) => ({ ...entry, route: routes.lookup(entry.callsign, AIRPORT.icao) }));

  const snapshot = {
    generatedAt: new Date(nowMs).toISOString(),
    airportIcao: AIRPORT.icao,
    source: 'adsb.lol — /v2/point',
    attribution: ATTRIBUTION,
    license: 'ODbL-1.0',
    routesAttribution: routes.available ? ROUTES_ATTRIBUTION : null,
    radiusKm: RADIUS_KM,
    aircraft,
  };

  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(snapshot, null, 2)}\n`);
  const withRoutes = aircraft.filter((entry) => entry.route).length;
  console.log(
    `Wrote ${aircraft.length} aircraft (${withRoutes} with a reported route${routes.available ? '' : '; route data unavailable'}) to ${OUTPUT}`,
  );
}

await main();
