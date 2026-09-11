#!/usr/bin/env node
/**
 * Fetch current road disruption near Manchester Airport from National
 * Highways' Road and Lane Closures service and write it as a static JSON file.
 *
 * ## Why a key is acceptable here
 *
 * Every free UK source for road disruption requires registration — verified
 * 11 September 2026. A key does not break this project's rules as long as it
 * never reaches a browser and no visitor is asked for one. This runs in CI,
 * reads the key from the environment, and publishes a static file the app
 * fetches from its own origin, exactly like the flight and weather snapshots.
 *
 * Terms verified against the provider's own documentation, same date:
 * redistribution is explicitly permitted, commercial use is permitted, the
 * rate limit is 10 calls per minute per key, and there is no payment method on
 * file. Attribution is required verbatim and is rendered in the app wherever
 * this data appears.
 *
 * ## Status
 *
 * Inert until NATIONAL_HIGHWAYS_KEY is set. Without it nothing is written, the
 * app reports road disruption as "not checked", and the recommendation is
 * unchanged.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseClosures } from './lib/datex.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUTPUT = resolve(HERE, '../public/data/roads/EGCC-disruption.json');

const AIRPORT = { latitude: 53.3537, longitude: -2.275 };
const SEARCH_RADIUS_KM = 40;
/** How far ahead planned works are worth knowing about for one airport run. */
const LOOK_AHEAD_HOURS = 6;

/** Deliberately well inside the documented 10 calls per minute per key. */
const MAX_PAGES = 3;
const REQUEST_SPACING_MS = 6_000;

function pause(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new Error('aborted'));
      },
      { once: true },
    );
  });
}

const KEY = process.env.NATIONAL_HIGHWAYS_KEY ?? '';
/*
 * `||`, not `??`. An unset GitHub Actions variable arrives as an empty string
 * rather than undefined, which `??` happily accepts — producing `new URL('')`
 * and a bare "Invalid URL" that says nothing about the cause.
 */
const BASE =
  process.env.ROAD_DISRUPTION_URL || 'https://api.data.nationalhighways.co.uk/roads/v2.0/closures';

/**
 * Required verbatim by clause 20(a) of the licence, typographic apostrophe and
 * all. Do not reword, and do not "fix" the punctuation.
 */
const ATTRIBUTION = 'Powered by National Highways’ Transport Data Feeds';

/**
 * Fetch one page.
 *
 * The response media type must be requested explicitly: the endpoint can serve
 * `application/xml` as well as JSON, and relying on a default would be one
 * upstream change away from breaking.
 */
async function fetchPage({ closureType, startDateTime, endDateTime, pageCursor, signal }) {
  const url = new URL(BASE);
  url.searchParams.set('closureType', closureType);
  url.searchParams.set('startDateTime', startDateTime);
  url.searchParams.set('endDateTime', endDateTime);
  if (pageCursor !== undefined) url.searchParams.set('pageCursor', String(pageCursor));

  const response = await fetch(url, {
    signal,
    headers: {
      'Ocp-Apim-Subscription-Key': KEY,
      'X-Response-MediaType': 'application/json',
      'X-Data-Format': 'DATEXII',
      accept: 'application/json',
    },
  });

  if (response.status === 429) throw new Error('rate limited (10 calls per minute per key)');
  if (!response.ok) throw new Error(`${closureType}: provider responded ${response.status}`);

  const contentType = response.headers.get('content-type') ?? '';
  const body = await response.text();

  if (!contentType.includes('json') && !body.trimStart().startsWith('{')) {
    throw new Error(
      `${closureType}: expected JSON but received "${contentType}". First 200 characters: ${body.slice(0, 200)}`,
    );
  }

  return JSON.parse(body);
}

/**
 * Both kinds matter and they are separate requests: the endpoint defaults to
 * planned closures only, so asking for neither would silently omit every live
 * incident — the half a driver most needs.
 */
async function collect(closureType, now, signal) {
  const startDateTime = new Date(now).toISOString().replace(/\.\d+Z$/, 'Z');
  const endDateTime = new Date(now + LOOK_AHEAD_HOURS * 60 * 60_000)
    .toISOString()
    .replace(/\.\d+Z$/, 'Z');

  const collected = [];
  let pageCursor;

  /*
   * Bounded and spaced. Clause 17 allows immediate termination for
   * "inadvertent disruption of NH's systems due to incorrect operation or
   * design of Your interface", so this stays comfortably clear of the
   * documented 10-calls-per-minute limit rather than merely under it: at most
   * three pages per closure type, six seconds apart, two types in sequence.
   * Worst case is six requests spread over about thirty seconds.
   */
  for (let page = 0; page < MAX_PAGES; page += 1) {
    if (page > 0) await pause(REQUEST_SPACING_MS, signal);
    const payload = await fetchPage({ closureType, startDateTime, endDateTime, pageCursor, signal });
    const parsed = parseClosures(payload, {
      now,
      airport: AIRPORT,
      radiusKm: SEARCH_RADIUS_KM,
      closureType,
    });
    collected.push(...parsed);

    const next = payload?.D2Payload?.pageCursor ?? payload?.pageCursor;
    if (next === undefined || next === null || next === pageCursor) break;
    pageCursor = next;
  }

  return collected;
}

async function main() {
  if (!KEY) {
    console.log(
      'Road disruption: no NATIONAL_HIGHWAYS_KEY set, so nothing was fetched. ' +
        'The app reports road disruption as "not checked" and its recommendation is ' +
        'unchanged. See DATA-SOURCES.md to enable it.',
    );
    return;
  }

  const now = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);

  let disruptions = [];
  try {
    // Sequential, not parallel: two concurrent paginated fetches would double
    // the instantaneous rate for no benefit on a fifteen-minute schedule.
    const unplanned = await collect('unplanned', now, controller.signal);
    await pause(REQUEST_SPACING_MS, controller.signal);
    const planned = await collect('planned', now, controller.signal);

    const byId = new Map();
    for (const entry of [...unplanned, ...planned]) {
      // Unplanned first: a live incident outranks a planned roadwork with the
      // same identifier.
      if (!byId.has(entry.id)) byId.set(entry.id, entry);
    }
    disruptions = [...byId.values()].sort(
      (a, b) => a.distanceFromAirportKm - b.distanceFromAirportKm,
    );
  } catch (error) {
    // Never overwrite a good snapshot with a bad one.
    console.error(
      `Road disruption fetch failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
    return;
  } finally {
    clearTimeout(timeout);
  }

  const snapshot = {
    generatedAt: Date.now(),
    source: BASE,
    attribution: ATTRIBUTION,
    searchRadiusKm: SEARCH_RADIUS_KM,
    disruptions,
  };

  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(
    `Wrote ${disruptions.length} disruptions within ${SEARCH_RADIUS_KM} km of ${AIRPORT.latitude},${AIRPORT.longitude}`,
  );
}

await main();
