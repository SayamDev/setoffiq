#!/usr/bin/env node
/**
 * One-off check of two things a free AirLabs key might give, before anything
 * depends on either. Never prints the key or a request URL.
 *
 * 1. How far ahead `/schedules` actually reaches. The documentation says ten
 *    hours; the published file suggests a free key returns far less, which is
 *    why the picker can be empty at night.
 * 2. Whether `/routes` — the weekly timetable, with days of the week and times
 *    — is available at all on a free key. That is what a list "at any hour of
 *    any day" would have to come from.
 */
const raw = process.env.AIRLABS_KEY ?? '';
const key = raw.trim();
if (!key) {
  console.log('AIRLABS_KEY is not set; nothing to check.');
  process.exit(0);
}
console.log(`key: ${key.length} characters`);

const call = async (path, params) => {
  const url = new URL(`https://airlabs.co/api/v9/${path}`);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  url.searchParams.set('api_key', key);
  const response = await fetch(url, { signal: AbortSignal.timeout(25_000) });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
};

const hours = (ms) => (ms / 3_600_000).toFixed(1);
const toMs = (value) =>
  typeof value === 'string' ? Date.parse(`${value.replace(' ', 'T')}:00Z`) : NaN;

console.log('\n===== /schedules: how far ahead does a free key see? =====');
for (const [direction, param] of [['arrivals', 'arr_iata'], ['departures', 'dep_iata']]) {
  const { status, body } = await call('schedules', { [param]: 'MAN' });
  if (body.error) {
    console.log(`${direction}: HTTP ${status} error ${JSON.stringify(body.error)}`);
    continue;
  }
  const rows = Array.isArray(body.response) ? body.response : [];
  const field = direction === 'arrivals' ? 'arr_time_utc' : 'dep_time_utc';
  const times = rows.map((row) => toMs(row[field])).filter(Number.isFinite).sort((a, b) => a - b);
  const now = Date.now();
  console.log(
    `${direction}: ${rows.length} rows, has_more ${body.request?.has_more ?? 'n/a'}, ` +
      (times.length
        ? `from ${hours(times[0] - now)} h to ${hours(times.at(-1) - now)} h relative to now ` +
          `(${times.filter((t) => t > now).length} still ahead)`
        : 'no usable times'),
  );
}

console.log('\n===== /routes: is the weekly timetable on the free plan? =====');
for (const [label, params] of [
  ['departures from MAN', { dep_iata: 'MAN' }],
  ['arrivals at MAN', { arr_iata: 'MAN' }],
]) {
  const { status, body } = await call('routes', params);
  if (body.error) {
    console.log(`${label}: HTTP ${status} error ${JSON.stringify(body.error)}`);
    continue;
  }
  const rows = Array.isArray(body.response) ? body.response : [];
  const fields = new Set();
  for (const row of rows) for (const [k, v] of Object.entries(row)) if (v !== null && v !== undefined && v !== '') fields.add(k);
  console.log(
    `${label}: HTTP ${status}, ${rows.length} rows, has_more ${body.request?.has_more ?? 'n/a'}, ` +
      `limit ${body.request?.params?.limit ?? 'n/a'}`,
  );
  console.log('  fields:', [...fields].sort().join(', '));
  for (const row of rows.slice(0, 3)) console.log('  ', JSON.stringify(row));
}
