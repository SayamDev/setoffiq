#!/usr/bin/env node
/**
 * Fetch the current aerodrome observation (METAR) for Manchester from the NOAA
 * Aviation Weather Center and write it as a static JSON file.
 *
 * Why this exists, same as the flight snapshot: the Aviation Weather Center
 * serves this data free and without a key, but sends no
 * `access-control-allow-origin` header, so a browser on another origin cannot
 * call it. A scheduled job fetches it and publishes it alongside the app.
 *
 * This is a different question from the forecast SetoffIQ already uses. The
 * forecast describes the weather on the drive; a METAR describes the aerodrome
 * in the terms that actually govern how quickly arrivals are landed.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUTPUT = resolve(HERE, '../public/data/airport/EGCC-conditions.json');
const ICAO = 'EGCC';

const ATTRIBUTION =
  'Aerodrome observations from the NOAA Aviation Weather Center (aviationweather.gov)';

/** Ceiling is the lowest broken or overcast layer, not simply the lowest cloud. */
function ceilingFt(clouds) {
  if (!Array.isArray(clouds)) return null;
  const obscuring = clouds
    .filter((layer) => layer?.cover === 'BKN' || layer?.cover === 'OVC' || layer?.cover === 'OVX')
    .map((layer) => layer.base)
    .filter((base) => typeof base === 'number');
  return obscuring.length ? Math.min(...obscuring) : null;
}

function summarise(report, ceiling) {
  const parts = [];

  const category = report.fltCat;
  if (category === 'LIFR' || category === 'IFR') {
    parts.push('Low cloud or poor visibility');
  } else if (category === 'MVFR') {
    parts.push('Marginal conditions');
  } else if (category === 'VFR') {
    parts.push('Clear and unrestricted');
  } else {
    parts.push('Conditions reported');
  }

  if (typeof report.wspd === 'number' && report.wspd >= 20) {
    parts.push(`strong wind ${report.wspd} kt`);
  }
  if (ceiling !== null && ceiling < 1500) {
    parts.push(`ceiling ${ceiling} ft`);
  }
  if (typeof report.visib === 'string' && !report.visib.includes('+')) {
    parts.push(`visibility ${report.visib}`);
  }

  return parts.join(', ');
}

async function main() {
  const url = `https://aviationweather.gov/api/data/metar?ids=${ICAO}&format=json`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  let conditions = null;
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Aviation Weather Center responded ${response.status}`);
    const payload = await response.json();
    const report = Array.isArray(payload) ? payload[0] : null;
    if (!report) throw new Error('no observation returned');

    const ceiling = ceilingFt(report.clouds);
    conditions = {
      icaoCode: report.icaoId ?? ICAO,
      observedAt: typeof report.obsTime === 'number' ? report.obsTime * 1000 : Date.now(),
      temperatureC: typeof report.temp === 'number' ? report.temp : null,
      windDirectionDeg: typeof report.wdir === 'number' ? report.wdir : null,
      windSpeedKt: typeof report.wspd === 'number' ? report.wspd : null,
      visibility: report.visib === undefined ? null : String(report.visib),
      ceilingFt: ceiling,
      flightCategory: ['VFR', 'MVFR', 'IFR', 'LIFR'].includes(report.fltCat) ? report.fltCat : null,
      raw: report.rawOb ?? '',
      summary: summarise(report, ceiling),
    };
  } catch (error) {
    // A failed run leaves the previous observation in place rather than
    // publishing an empty one.
    console.error(`Conditions snapshot failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
    return;
  } finally {
    clearTimeout(timeout);
  }

  const snapshot = {
    generatedAt: new Date().toISOString(),
    icaoCode: ICAO,
    source: 'NOAA Aviation Weather Center — /api/data/metar',
    attribution: ATTRIBUTION,
    conditions,
  };

  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`Wrote ${ICAO} conditions: ${conditions.summary}`);
}

await main();
