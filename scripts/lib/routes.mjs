/**
 * Reported routes from the Virtual Radar Server standing data.
 *
 * https://github.com/vradarserver/standing-data — CC0 1.0, built from routes
 * submitted by Virtual Radar Server users and refreshed daily. The deploy job
 * keeps a sparse clone of `routes/` and `airports/` and passes its path in; if
 * the clone is missing, every route is simply unknown.
 *
 * Community-submitted, so "reported", never "scheduled": airlines reuse
 * alphanumeric callsigns across seasons, and a submission can lag a change.
 *
 * Layout (schema-01):
 *   routes/schema-01/<A>/<ABC>-all.csv       one file per airline, or
 *   routes/schema-01/<A>/<ABC>-<n>.csv       sharded by the number's first char
 *     Callsign,Code,Number,AirlineCode,AirportCodes     AirportCodes "LEIB-EGCC"
 *   airports/schema-01/<A>/<AB>.csv
 *     Code,Name,ICAO,IATA,Location,CountryISO2,Latitude,Longitude,AltitudeFeet
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Split a CSV line, honouring quoted fields ("Name, with comma"). */
export function splitCsvLine(line) {
  const out = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      out.push(field);
      field = '';
    } else {
      field += char;
    }
  }
  out.push(field);
  return out;
}

function readCsv(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').replace(/^﻿/, '').split(/\r?\n/).slice(1).filter(Boolean).map(splitCsvLine);
}

/**
 * Of a route's airports, the leg that matters to this airport: arriving here
 * if it appears after the first stop, otherwise first to last.
 */
export function legFor(airportCodes, airportIcao) {
  const codes = airportCodes.split('-').map((code) => code.trim()).filter(Boolean);
  if (codes.length < 2) return null;
  const here = codes.indexOf(airportIcao);
  if (here > 0) return { from: codes[here - 1], to: airportIcao };
  if (here === 0) return { from: airportIcao, to: codes[1] };
  return { from: codes[0], to: codes[codes.length - 1] };
}

export function createRouteLookup(standingDataDir) {
  const routesDir = standingDataDir ? join(standingDataDir, 'routes', 'schema-01') : null;
  const airportsDir = standingDataDir ? join(standingDataDir, 'airports', 'schema-01') : null;
  const available = Boolean(routesDir && existsSync(routesDir));

  const routeFiles = new Map();
  const airportFiles = new Map();

  function routesFor(callsign) {
    const prefix = callsign.slice(0, 3);
    const number = callsign.slice(3);
    const letter = prefix[0];
    const whole = join(routesDir, letter, `${prefix}-all.csv`);
    const file = existsSync(whole) ? whole : join(routesDir, letter, `${prefix}-${number[0]}.csv`);
    if (!routeFiles.has(file)) {
      routeFiles.set(file, new Map(readCsv(file).map((row) => [row[0], row[4] ?? ''])));
    }
    return routeFiles.get(file);
  }

  function airport(icao) {
    const file = join(airportsDir, icao[0], `${icao.slice(0, 2)}.csv`);
    if (!airportFiles.has(file)) {
      airportFiles.set(
        file,
        new Map(readCsv(file).map((row) => [row[2] || row[0], { name: row[1], iata: row[3] || null, city: row[4] || null, country: row[5] || null }])),
      );
    }
    const found = airportFiles.get(file).get(icao);
    return { icao, iata: found?.iata ?? null, city: found?.city ?? null, name: found?.name ?? null, country: found?.country ?? null };
  }

  return {
    available,
    /** The reported leg for a callsign, relative to `airportIcao`, or null. */
    lookup(callsign, airportIcao) {
      if (!available || !/^[A-Z]{3}[A-Z0-9]+$/.test(callsign)) return null;
      const codes = routesFor(callsign).get(callsign);
      if (!codes) return null;
      const leg = legFor(codes, airportIcao);
      if (!leg) return null;
      return { from: airport(leg.from), to: airport(leg.to) };
    },
  };
}

/**
 * Airports by IATA code — "LHR" to Heathrow, London, GB — from the same
 * standing data. Schedules name airports by IATA; routes by ICAO.
 */
export function createIataLookup(standingDataDir) {
  const airportsDir = standingDataDir ? join(standingDataDir, 'airports', 'schema-01') : null;
  const byIata = new Map();
  if (airportsDir && existsSync(airportsDir)) {
    for (const entry of readdirSync(airportsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = join(airportsDir, entry.name);
      for (const file of readdirSync(dir).filter((name) => name.endsWith('.csv'))) {
        for (const row of readCsv(join(dir, file))) {
          const iata = row[3];
          if (iata && !byIata.has(iata)) {
            byIata.set(iata, { icao: row[2] || row[0], iata, city: row[4] || null, name: row[1] || null, country: row[5] || null });
          }
        }
      }
    }
  }
  return (iata) => (iata ? (byIata.get(iata) ?? null) : null);
}

