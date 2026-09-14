#!/usr/bin/env node
/**
 * Manchester's weekly timetable from AirLabs, published beside the schedule.
 *
 * Why this exists: a free AirLabs key returns only about three hours of
 * `/schedules` either side of now — measured, not assumed, by
 * `scripts/probe-airlabs-routes.mjs`. So at two in the morning, or for anyone
 * planning a pickup tomorrow, the schedule has nothing to show. `/routes` is
 * the airlines' weekly timetable — flight number, days of the week, times —
 * and it answers at any hour of any day.
 *
 * It carries no status, so the app never presents it as one: the schedule and
 * live positions say what is happening today, and the timetable says what is
 * meant to happen. It changes slowly, so it is refreshed weekly.
 *
 * The key lives in the AIRLABS_KEY repository secret and is used only here.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toTimetableEntries } from './lib/timetable.mjs';
import { createIataLookup } from './lib/routes.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUTPUT = resolve(HERE, '../public/data/flights/EGCC-timetable.json');
const PUBLISHED = 'https://sayamdev.github.io/setoffiq/data/flights/EGCC-timetable.json';
const AIRPORT_IATA = 'MAN';

/** Timetables change with the season, not with the hour. */
const REFRESH_DAYS = 7;
/**
 * The free plan allows 1,000 requests a month. The schedule takes about 90 of
 * them; this is the rest of the safe share, and a weekly refresh at 50 rows a
 * page costs well under it.
 */
const MONTHLY_BUDGET = 400;
/** Pages per direction, 50 rows each: enough for a full week at Manchester. */
const MAX_PAGES = 40;

const month = (ms) => new Date(ms).toISOString().slice(0, 7);

async function previousTimetable() {
  const candidates = [];
  try {
    const response = await fetch(`${PUBLISHED}?t=${Date.now()}`, { signal: AbortSignal.timeout(15_000) });
    if (response.ok) candidates.push(await response.json());
  } catch {
    // Fall back to the local copies.
  }
  for (const path of [process.env.TIMETABLE_CACHE_FILE, OUTPUT].filter(Boolean)) {
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
    const url = new URL('https://airlabs.co/api/v9/routes');
    url.searchParams.set(param, AIRPORT_IATA);
    url.searchParams.set('offset', String(page * 50));
    url.searchParams.set('api_key', key);
    const response = await fetch(url, { signal: AbortSignal.timeout(25_000) });
    usage.requests += 1;
    const body = await response.json();
    // Never echo the URL: it carries the key.
    if (!response.ok || body.error) throw new Error(`AirLabs routes ${param}: ${body.error?.code ?? response.status}`);
    const page_rows = body.response ?? [];
    rows.push(...page_rows);
    if (!(body.request?.has_more ?? body.has_more) || page_rows.length === 0) break;
  }
  return rows;
}

async function write(timetable) {
  const body = `${JSON.stringify(timetable)}\n`;
  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, body);
  if (process.env.TIMETABLE_CACHE_FILE) {
    await mkdir(dirname(process.env.TIMETABLE_CACHE_FILE), { recursive: true });
    await writeFile(process.env.TIMETABLE_CACHE_FILE, body);
  }
}

async function main() {
  const key = (process.env.AIRLABS_KEY ?? '').trim();
  const now = Date.now();
  const previous = await previousTimetable();

  if (!key) {
    console.log('AIRLABS_KEY not set: no timetable published.');
    return;
  }

  const usage =
    previous?.usage?.month === month(now) ? { ...previous.usage } : { month: month(now), requests: 0 };
  const ageDays = previous ? (now - Date.parse(previous.generatedAt)) / 86_400_000 : Infinity;

  if (previous && ageDays < REFRESH_DAYS) {
    await write(previous);
    console.log(`Timetable kept: ${ageDays.toFixed(1)} days old; ${usage.requests}/${MONTHLY_BUDGET} requests this month.`);
    return;
  }
  if (usage.requests >= MONTHLY_BUDGET) {
    if (previous) await write(previous);
    console.log(`Timetable not refreshed: ${usage.requests}/${MONTHLY_BUDGET} requests used this month.`);
    return;
  }

  try {
    const placeFor = createIataLookup(process.env.STANDING_DATA_DIR);
    const arrivals = toTimetableEntries(await fetchDirection(key, 'arr_iata', usage), 'arrival', placeFor);
    const departures = toTimetableEntries(await fetchDirection(key, 'dep_iata', usage), 'departure', placeFor);
    if (arrivals.length === 0 && departures.length === 0) throw new Error('no timetable rows returned');
    await write({
      generatedAt: new Date(now).toISOString(),
      airportIata: AIRPORT_IATA,
      source: 'AirLabs — /routes',
      attribution: 'Flight schedules from AirLabs (airlabs.co)',
      usage,
      arrivals,
      departures,
    });
    console.log(`Timetable refreshed: ${arrivals.length} arrivals, ${departures.length} departures; ${usage.requests}/${MONTHLY_BUDGET} requests this month.`);
  } catch (error) {
    // A failed refresh keeps the last good timetable, with its own timestamp.
    if (previous) await write({ ...previous, usage });
    console.error(`Timetable refresh failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

await main();
