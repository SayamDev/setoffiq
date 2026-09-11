#!/usr/bin/env node
/**
 * Manchester's arrivals and departures from AirLabs, published as a static
 * file beside the flight snapshot.
 *
 * AirLabs' free plan gives 1,000 requests a month and 100 flights a request;
 * a Manchester refresh takes about six. So this runs on every deploy but only
 * calls AirLabs when the published schedule is more than REFRESH_HOURS old,
 * and never past MONTHLY_BUDGET requests in a calendar month. In between it
 * republishes what it has, and the app says how old the status is. Aircraft in
 * the air stay current from the live snapshot regardless.
 *
 * The key lives in the AIRLABS_KEY repository secret and is used only here.
 * Without it the script does nothing, and the app falls back to live
 * positions and its own record of usual flights.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toScheduleEntries } from './lib/airlabs.mjs';
import { createIataLookup } from './lib/routes.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUTPUT = resolve(HERE, '../public/data/flights/EGCC-schedule.json');
const PUBLISHED = 'https://sayamdev.github.io/setoffiq/data/flights/EGCC-schedule.json';
const AIRPORT_IATA = 'MAN';

/** How old the published schedule may get before it is refreshed. */
const REFRESH_HOURS = 4.5;
/** Kept under the free plan's 1,000 a month, with room for manual checks. */
const MONTHLY_BUDGET = 900;
/** Pages per direction; each is 100 flights. */
const MAX_PAGES = 4;

const month = (ms) => new Date(ms).toISOString().slice(0, 7);

async function previousSchedule() {
  const candidates = [];
  try {
    const response = await fetch(`${PUBLISHED}?t=${Date.now()}`, { signal: AbortSignal.timeout(15_000) });
    if (response.ok) candidates.push(await response.json());
  } catch {
    // Fall back to the local copies.
  }
  for (const path of [process.env.SCHEDULE_CACHE_FILE, OUTPUT].filter(Boolean)) {
    try {
      candidates.push(JSON.parse(await readFile(path, 'utf8')));
    } catch {
      // Not this one.
    }
  }
  const valid = candidates.filter((entry) => entry?.generatedAt && Array.isArray(entry.arrivals));
  valid.sort((a, b) => Date.parse(b.generatedAt) - Date.parse(a.generatedAt));
  return valid[0] ?? null;
}

async function fetchDirection(key, param, usage) {
  const rows = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    if (usage.requests >= MONTHLY_BUDGET) throw new Error('monthly request budget reached');
    const url = new URL('https://airlabs.co/api/v9/schedules');
    url.searchParams.set(param, AIRPORT_IATA);
    url.searchParams.set('offset', String(page * 100));
    url.searchParams.set('api_key', key);
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    usage.requests += 1;
    const body = await response.json();
    // Never echo the URL: it carries the key.
    if (!response.ok || body.error) throw new Error(`AirLabs ${param}: ${body.error?.code ?? response.status}`);
    rows.push(...(body.response ?? []));
    if (!(body.request?.has_more ?? body.has_more)) break;
  }
  return rows;
}

async function write(schedule) {
  const body = `${JSON.stringify(schedule)}\n`;
  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, body);
  if (process.env.SCHEDULE_CACHE_FILE) {
    await mkdir(dirname(process.env.SCHEDULE_CACHE_FILE), { recursive: true });
    await writeFile(process.env.SCHEDULE_CACHE_FILE, body);
  }
}

async function main() {
  const key = (process.env.AIRLABS_KEY ?? '').trim();
  const now = Date.now();
  const previous = await previousSchedule();

  if (!key) {
    console.log('AIRLABS_KEY not set: no schedule published.');
    return;
  }

  const usage =
    previous?.usage?.month === month(now) ? { ...previous.usage } : { month: month(now), requests: 0 };
  const ageHours = previous ? (now - Date.parse(previous.generatedAt)) / 3_600_000 : Infinity;

  if (previous && ageHours < REFRESH_HOURS) {
    await write(previous);
    console.log(`Schedule kept: ${ageHours.toFixed(1)} h old; ${usage.requests}/${MONTHLY_BUDGET} requests this month.`);
    return;
  }
  if (usage.requests + 2 * MAX_PAGES > MONTHLY_BUDGET) {
    if (previous) await write(previous);
    console.log(`Schedule not refreshed: ${usage.requests}/${MONTHLY_BUDGET} requests used this month.`);
    return;
  }

  try {
    const placeFor = createIataLookup(process.env.STANDING_DATA_DIR);
    const arrivals = toScheduleEntries(await fetchDirection(key, 'arr_iata', usage), 'arrival', placeFor);
    const departures = toScheduleEntries(await fetchDirection(key, 'dep_iata', usage), 'departure', placeFor);
    await write({
      generatedAt: new Date(now).toISOString(),
      airportIata: AIRPORT_IATA,
      source: 'AirLabs — /schedules',
      attribution: 'Flight schedules from AirLabs (airlabs.co)',
      usage,
      arrivals,
      departures,
    });
    console.log(`Schedule refreshed: ${arrivals.length} arrivals, ${departures.length} departures; ${usage.requests}/${MONTHLY_BUDGET} requests this month.`);
  } catch (error) {
    // A failed refresh keeps the last good schedule, with its own timestamp.
    if (previous) await write({ ...previous, usage });
    console.error(`Schedule refresh failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

await main();
