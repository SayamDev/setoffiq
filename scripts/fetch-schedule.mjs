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
import { mergeLandings, readPrevious } from './lib/landings.mjs';
import { createIataLookup } from './lib/routes.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUTPUT = resolve(HERE, '../public/data/flights/EGCC-schedule.json');
const PUBLISHED = 'https://sayamdev.github.io/setoffiq/data/flights/EGCC-schedule.json';
const AIRPORT_IATA = 'MAN';
const LANDINGS_OUTPUT = resolve(HERE, '../public/data/flights/EGCC-landings.json');
const LANDINGS_URL = 'https://sayamdev.github.io/setoffiq/data/flights/EGCC-landings.json';

/** How old the published schedule may get before it is refreshed. */
const REFRESH_HOURS = 4.5;
/**
 * The free plan allows 1,000 requests a month, shared with the timetable
 * (680). September 2026 used 228 here in 25 days — the scheduled deploy runs
 * more often than it did — so 300 covers a month with a little room, and the
 * two ceilings together stay under the plan.
 */
const MONTHLY_BUDGET = 300;
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

/**
 * Fold whatever schedule is being published into the landing record, so actual
 * landing times are kept after they drop out of the schedule's short window.
 * No request is made for this. A failure here never costs the schedule.
 */
async function recordLandings(schedule) {
  try {
    const previous = await readPrevious({
      cacheFile: process.env.LANDINGS_CACHE_FILE,
      localFile: LANDINGS_OUTPUT,
      url: LANDINGS_URL,
      isValid: (entry) => Boolean(entry?.generatedAt && entry.landings && typeof entry.landings === 'object'),
      readFile,
      fetch,
    });
    const record = mergeLandings(previous, schedule, Date.now());
    const body = `${JSON.stringify(record)}\n`;
    await mkdir(dirname(LANDINGS_OUTPUT), { recursive: true });
    await writeFile(LANDINGS_OUTPUT, body);
    if (process.env.LANDINGS_CACHE_FILE) {
      await mkdir(dirname(process.env.LANDINGS_CACHE_FILE), { recursive: true });
      await writeFile(process.env.LANDINGS_CACHE_FILE, body);
    }
    const all = Object.values(record.landings);
    console.log(`Landing record: ${all.length} arrivals, ${all.filter((entry) => entry.actual !== null).length} with an actual time, since ${record.since}.`);
  } catch (error) {
    console.error(`Landing record not updated: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function write(schedule) {
  await recordLandings(schedule);
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
