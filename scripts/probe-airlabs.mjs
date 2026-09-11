#!/usr/bin/env node
/**
 * One-off check of what a free AirLabs key actually returns for Manchester,
 * before anything depends on it. Two requests. Prints field names, counts and
 * a few flights — never the key or the request URL.
 */
import { fieldsPresent } from './lib/airlabs.mjs';

const key = process.env.AIRLABS_KEY;
if (!key) {
  console.log('AIRLABS_KEY is not set; nothing to check.');
  process.exit(0);
}

for (const [direction, param] of [['arrivals', 'arr_iata'], ['departures', 'dep_iata']]) {
  const url = new URL('https://airlabs.co/api/v9/schedules');
  url.searchParams.set(param, 'MAN');
  url.searchParams.set('api_key', key);
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  const body = await response.json().catch(() => ({}));
  console.log(`\n== ${direction}: HTTP ${response.status}`);
  if (body.error) {
    console.log('error:', JSON.stringify(body.error));
    continue;
  }
  const rows = Array.isArray(body.response) ? body.response : [];
  console.log('rows:', rows.length, '| has_more:', body.request?.has_more ?? body.has_more ?? 'n/a', '| limit:', body.request?.params?.limit ?? 'n/a');
  console.log('fields present:', fieldsPresent(rows).join(', '));
  const counts = rows.reduce((acc, row) => ((acc[row.status ?? 'none'] = (acc[row.status ?? 'none'] ?? 0) + 1), acc), {});
  console.log('status counts:', JSON.stringify(counts));
  console.log('with a delay figure:', rows.filter((row) => typeof row.delayed === 'number' || typeof row.arr_delayed === 'number' || typeof row.dep_delayed === 'number').length);
  console.log('codeshare rows:', rows.filter((row) => row.cs_flight_iata).length);
  for (const row of rows.slice(0, 4)) {
    const pick = ['flight_iata', 'flight_icao', 'dep_iata', 'arr_iata', 'dep_time', 'arr_time', 'dep_estimated', 'arr_estimated', 'status', 'delayed', 'arr_delayed', 'dep_delayed', 'cs_flight_iata'];
    console.log('  ', JSON.stringify(Object.fromEntries(pick.filter((k) => k in row).map((k) => [k, row[k]]))));
  }
  if (body.terms) console.log('terms note:', String(body.terms).replace(/\s+/g, ' '));
}
