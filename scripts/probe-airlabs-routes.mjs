#!/usr/bin/env node
/**
 * One-off check of what a free AirLabs key gives from `/routes`, the weekly
 * timetable. Never prints the key or a request URL.
 *
 * The first run of this probe showed `/schedules` reaches only about three
 * hours ahead on a free key, and that `/routes` is available. The published
 * timetable then came back with 43 flights whose destinations all began with
 * A or B — so paging is capped. This measures where the cap is, and whether
 * filtering by airline gets past it, which decides how the timetable has to
 * be fetched.
 */
const raw = process.env.AIRLABS_KEY ?? '';
const key = raw.trim();
if (!key) {
  console.log('AIRLABS_KEY is not set; nothing to check.');
  process.exit(0);
}

const call = async (params) => {
  const url = new URL('https://airlabs.co/api/v9/routes');
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  url.searchParams.set('api_key', key);
  const response = await fetch(url, { signal: AbortSignal.timeout(25_000) });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
};

const summarise = async (label, params) => {
  const { status, body } = await call(params);
  if (body.error) {
    console.log(`${label}: HTTP ${status} error ${JSON.stringify(body.error)}`);
    return;
  }
  const rows = Array.isArray(body.response) ? body.response : [];
  const airports = rows.map((row) => (params.dep_iata ? row.arr_iata : row.dep_iata)).filter(Boolean);
  console.log(
    `${label}: ${rows.length} rows, has_more ${body.request?.has_more ?? 'n/a'}` +
      (airports.length ? `, ${airports[0]} … ${airports.at(-1)}` : ''),
  );
};

console.log('== paging without a filter ==');
for (const offset of [0, 50, 100, 150]) {
  await summarise(`offset ${offset}`, { dep_iata: 'MAN', offset: String(offset) });
}

console.log('\n== one airline at a time ==');
for (const airline of ['FR', 'U2', 'LS', 'BA']) {
  await summarise(`${airline} offset 0`, { dep_iata: 'MAN', airline_iata: airline });
  await summarise(`${airline} offset 50`, { dep_iata: 'MAN', airline_iata: airline, offset: '50' });
}
