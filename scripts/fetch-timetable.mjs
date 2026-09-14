#!/usr/bin/env node
/**
 * Manchester's weekly timetable from AirLabs, published beside the schedule.
 *
 * Why this exists: a free AirLabs key returns only about three hours of
 * `/schedules` either side of now — measured, not assumed, by
 * `scripts/probe-airlabs-routes.mjs`. So at two in the morning, or for anyone
 * planning a pickup next week, the schedule has nothing to show. `/routes` is
 * the airlines' weekly timetable — flight number, days of the week, times —
 * and it answers at any hour of any day. It carries no status, so the app
 * never presents it as one.
 *
 * How it has to be fetched: the same probe showed a free key returns **50 rows
 * per query and ignores `offset`**, so "everything leaving Manchester" comes
 * back as the first fifty destinations alphabetically and stops. The timetable
 * is therefore fetched one airport pair at a time. Which pairs to ask about
 * comes from the CC0 standing data already cloned for reported routes, plus
 * every airport the published schedule has named — no API requests spent on
 * discovering the list.
 *
 * That is a few hundred requests, so it runs monthly and counts every request
 * in the file it writes. A run that reaches its cap publishes what it has with
 * `partial: true` and the destinations it covered, and the next run picks up
 * where it left off instead of starting again.
 *
 * The key lives in the AIRLABS_KEY repository secret and is used only here.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toTimetableEntries } from './lib/timetable.mjs';
import { createIataLookup, partnerIataCodes } from './lib/routes.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUTPUT = resolve(HERE, '../public/data/flights/EGCC-timetable.json');
const PUBLISHED = 'https://sayamdev.github.io/setoffiq/data/flights/EGCC-timetable.json';
const SCHEDULE = 'https://sayamdev.github.io/setoffiq/data/flights/EGCC-schedule.json';
const AIRPORT_IATA = 'MAN';
const AIRPORT_ICAO = 'EGCC';

/**
 * How this file was fetched. A published timetable built by an older strategy
 * is refreshed whatever its age: the first one held 43 flights, all to
 * airports beginning A or B, and waiting a month to correct that would have
 * been absurd.
 */
const FETCH_VERSION = 2;
/** Timetables change with the season, not with the hour. */
const REFRESH_DAYS = 28;
/** A run that ran out of room should carry on soon, not in a month. */
const PARTIAL_RETRY_HOURS = 6;
/**
 * The free plan allows 1,000 requests a month, shared with the schedule (500).
 * A full sweep of Manchester's airport pairs is two requests each.
 */
const MONTHLY_BUDGET = 650;
/** Kept short enough that one run cannot spend a month's budget. */
const MAX_REQUESTS_PER_RUN = 450;
/** A free key's hard limit per query: what comes back past this is invisible. */
const ROWS_PER_QUERY = 50;
/** Spacing between requests, so a sweep is never a burst. */
const PACE_MS = 120;

const month = (ms) => new Date(ms).toISOString().slice(0, 7);
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function fetchJson(url, timeoutMs = 20_000) {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function previousTimetable() {
  const candidates = [];
  try {
    candidates.push(await fetchJson(`${PUBLISHED}?t=${Date.now()}`, 15_000));
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

/** Airports the published schedule has named, so a new route is picked up. */
async function scheduledPartners() {
  try {
    const schedule = await fetchJson(`${SCHEDULE}?t=${Date.now()}`, 15_000);
    const codes = new Set();
    for (const list of [schedule.arrivals, schedule.departures]) {
      for (const flight of list ?? []) if (flight.otherEnd?.iata) codes.add(flight.otherEnd.iata);
    }
    return [...codes];
  } catch {
    return [];
  }
}

async function fetchPair(key, params, usage, state) {
  const url = new URL('https://airlabs.co/api/v9/routes');
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  url.searchParams.set('api_key', key);
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  usage.requests += 1;
  state.thisRun += 1;
  const body = await response.json();
  // Never echo the URL: it carries the key.
  if (!response.ok || body.error) throw new Error(`AirLabs routes: ${body.error?.code ?? response.status}`);
  const rows = body.response ?? [];
  // Fifty rows means the answer was cut off, and what is missing cannot be
  // asked for. Worth recording rather than quietly publishing a short list.
  if (rows.length >= ROWS_PER_QUERY) state.truncated.add(params.dep_iata === AIRPORT_IATA ? params.arr_iata : params.dep_iata);
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

function isDue(previous, now) {
  if (!previous) return true;
  if (previous.fetchVersion !== FETCH_VERSION) return true;
  const age = now - Date.parse(previous.generatedAt);
  if (!Number.isFinite(age)) return true;
  return previous.partial ? age >= PARTIAL_RETRY_HOURS * 3_600_000 : age >= REFRESH_DAYS * 86_400_000;
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

  if (!isDue(previous, now)) {
    await write(previous);
    const ageDays = ((now - Date.parse(previous.generatedAt)) / 86_400_000).toFixed(1);
    console.log(`Timetable kept: ${ageDays} days old${previous.partial ? ' (partial)' : ''}; ${usage.requests}/${MONTHLY_BUDGET} requests this month.`);
    return;
  }
  if (usage.requests >= MONTHLY_BUDGET) {
    if (previous) await write(previous);
    console.log(`Timetable not refreshed: ${usage.requests}/${MONTHLY_BUDGET} requests used this month.`);
    return;
  }

  const placeFor = createIataLookup(process.env.STANDING_DATA_DIR);
  const destinations = [
    ...new Set([
      ...partnerIataCodes(process.env.STANDING_DATA_DIR, AIRPORT_ICAO),
      ...(await scheduledPartners()),
      ...(previous?.destinations ?? []),
    ]),
  ]
    .filter((code) => /^[A-Z0-9]{3}$/.test(code) && code !== AIRPORT_IATA)
    .sort();

  if (destinations.length === 0) {
    if (previous) await write(previous);
    console.error('No airport pairs to ask about: the standing data is missing and nothing was published.');
    process.exitCode = 1;
    return;
  }

  // A partial run resumes; a due refresh starts again from the top.
  const alreadyCovered = previous?.partial ? new Set(previous.covered ?? []) : new Set();
  const order = [
    ...destinations.filter((code) => !alreadyCovered.has(code)),
    ...destinations.filter((code) => alreadyCovered.has(code)),
  ];

  // Everything already known is kept, and replaced pair by pair as each is
  // refetched, so a run that stops early leaves the file no worse than before.
  const arrivals = new Map((previous?.arrivals ?? []).map((entry) => [`${entry.flight}@${entry.departureMinute}`, entry]));
  const departures = new Map((previous?.departures ?? []).map((entry) => [`${entry.flight}@${entry.departureMinute}`, entry]));
  const state = { thisRun: 0, truncated: new Set() };
  const covered = new Set(alreadyCovered);
  let failures = 0;

  for (const code of order) {
    if (state.thisRun + 2 > MAX_REQUESTS_PER_RUN || usage.requests + 2 > MONTHLY_BUDGET) break;
    try {
      const inbound = await fetchPair(key, { arr_iata: AIRPORT_IATA, dep_iata: code }, usage, state);
      await sleep(PACE_MS);
      const outbound = await fetchPair(key, { dep_iata: AIRPORT_IATA, arr_iata: code }, usage, state);
      await sleep(PACE_MS);

      for (const [map, rows, direction] of [
        [arrivals, inbound, 'arrival'],
        [departures, outbound, 'departure'],
      ]) {
        for (const [keyed, entry] of map) if (entry.otherEnd?.iata === code) map.delete(keyed);
        for (const entry of toTimetableEntries(rows, direction, placeFor)) {
          map.set(`${entry.flight}@${entry.departureMinute}`, entry);
        }
      }
      covered.add(code);
    } catch (error) {
      failures += 1;
      console.error(`${code}: ${error instanceof Error ? error.message : String(error)}`);
      // A run of failures is a key or quota problem, not one bad airport.
      if (failures >= 5) break;
    }
  }

  const partial = covered.size < destinations.length;
  await write({
    generatedAt: new Date(now).toISOString(),
    airportIata: AIRPORT_IATA,
    source: 'AirLabs — /routes',
    attribution: 'Flight schedules from AirLabs (airlabs.co)',
    fetchVersion: FETCH_VERSION,
    usage,
    partial,
    destinations,
    covered: [...covered].sort(),
    truncatedAt: [...state.truncated].sort(),
    arrivals: [...arrivals.values()].sort((a, b) => a.departureMinute - b.departureMinute),
    departures: [...departures.values()].sort((a, b) => a.departureMinute - b.departureMinute),
  });
  console.log(
    `Timetable ${partial ? 'part-refreshed' : 'refreshed'}: ${covered.size}/${destinations.length} airports, ` +
      `${arrivals.size} arrivals, ${departures.size} departures; ${state.thisRun} requests this run, ` +
      `${usage.requests}/${MONTHLY_BUDGET} this month` +
      (state.truncated.size ? `; cut off at ${[...state.truncated].sort().join(' ')}` : '') +
      `${failures ? `; ${failures} failed` : ''}.`,
  );
}

await main();
