#!/usr/bin/env node
/**
 * Fetch current road disruption near Manchester Airport and write it as a
 * static JSON file.
 *
 * ## Why this needs a key, and why that is still fine
 *
 * Every free UK source for road disruption requires registration — verified
 * 11 September 2026:
 *
 *   National Highways closures  401 {"message":"Invalid Subscription Key"}
 *   Street Manager roadworks    "You need to create an account" (GOV.UK)
 *   TfGM                        401 {"message":"Unauthorized"}
 *   NH UnplannedEvents.xml      redirects to 404 — the old open feed is gone
 *   WebTRIS                     free and keyless, but serves historical
 *                               traffic-count archives, not closures
 *
 * A key does not break this project's rules, provided it never reaches a
 * browser and no visitor is ever asked for one. This script runs in CI, reads
 * the key from the environment, and publishes a static file that the app reads
 * from its own origin — exactly the pattern already used for aircraft
 * positions and aerodrome observations.
 *
 * ## Status: not enabled
 *
 * No key has been registered, so this does not run. Without the resulting file
 * the app reports road disruption as "not checked" and its recommendation is
 * unchanged — the absence of a key can never degrade the product below what it
 * already does.
 *
 * ## Before enabling
 *
 * 1. Register at the provider and add the key as a repository secret.
 * 2. Verify the provider's terms against the £0 rule — free registration is not
 *    the same as free at volume, and anything that can bill must be rejected.
 * 3. **Verify `normalise()` against one real response.** It is written from the
 *    documented DATEX II shape and has not been run against live output. The
 *    validator below will refuse to publish anything it cannot map, so a wrong
 *    mapping fails loudly rather than producing plausible nonsense.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUTPUT = resolve(HERE, '../public/data/roads/EGCC-disruption.json');

const AIRPORT = { latitude: 53.3537, longitude: -2.275 };
const SEARCH_RADIUS_KM = 40;

const KEY = process.env.NATIONAL_HIGHWAYS_KEY ?? '';
const ENDPOINT = process.env.ROAD_DISRUPTION_URL ?? '';
const ATTRIBUTION =
  process.env.ROAD_DISRUPTION_ATTRIBUTION ?? 'Road disruption data from National Highways';

function haversineKm(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function categoryOf(raw) {
  const text = `${raw.type ?? ''} ${raw.category ?? ''}`.toLowerCase();
  if (text.includes('closure') || text.includes('closed')) return 'closure';
  if (text.includes('roadwork') || text.includes('maintenance')) return 'roadworks';
  if (text.includes('incident') || text.includes('accident')) return 'incident';
  return 'other';
}

function toInstant(value) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Map one provider record onto the domain shape.
 *
 * Returns null for anything it cannot map with confidence. Publishing a
 * half-understood record would be worse than publishing nothing, because the
 * app would present it to a driver as fact.
 */
function normalise(raw, index) {
  const latitude = Number(raw.latitude ?? raw.lat);
  const longitude = Number(raw.longitude ?? raw.lon ?? raw.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const description = String(raw.description ?? raw.comment ?? raw.title ?? '').trim();
  if (!description) return null;

  const road = String(raw.road ?? raw.roadNumber ?? raw.locationDescription ?? '').trim();
  if (!road) return null;

  return {
    id: String(raw.id ?? raw.situationId ?? `d${index}`),
    road,
    category: categoryOf(raw),
    description,
    distanceFromAirportKm: Math.round(haversineKm({ latitude, longitude }, AIRPORT)),
    startedAt: toInstant(raw.startDate ?? raw.overallStartTime),
    expectedEndAt: toInstant(raw.endDate ?? raw.overallEndTime),
    active: raw.active !== false,
  };
}

async function main() {
  if (!KEY || !ENDPOINT) {
    console.log(
      'Road disruption: no key or endpoint configured, so nothing was fetched. ' +
        'The app will report road disruption as "not checked". See DATA-SOURCES.md.',
    );
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);

  let disruptions = [];
  try {
    const response = await fetch(ENDPOINT, {
      signal: controller.signal,
      headers: { 'Ocp-Apim-Subscription-Key': KEY, accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`provider responded ${response.status}`);
    const payload = await response.json();

    const records = Array.isArray(payload) ? payload : (payload.items ?? payload.results ?? []);
    if (!Array.isArray(records)) throw new Error('unrecognised payload shape');

    const mapped = records.map(normalise).filter(Boolean);

    // If the provider returned records but none could be mapped, the mapping is
    // wrong. Fail rather than publish an empty file the app would read as
    // "nothing is happening on the roads".
    if (records.length > 0 && mapped.length === 0) {
      throw new Error(
        `received ${records.length} records but mapped none — verify normalise() against this provider`,
      );
    }

    disruptions = mapped.filter((entry) => entry.distanceFromAirportKm <= SEARCH_RADIUS_KM);
  } catch (error) {
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
    source: ENDPOINT,
    attribution: ATTRIBUTION,
    searchRadiusKm: SEARCH_RADIUS_KM,
    disruptions,
  };

  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`Wrote ${disruptions.length} disruptions within ${SEARCH_RADIUS_KM} km`);
}

await main();
