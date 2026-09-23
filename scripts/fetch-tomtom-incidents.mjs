#!/usr/bin/env node
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeTomTom } from './lib/tomtom.mjs';

const output = resolve(dirname(fileURLToPath(import.meta.url)), '../public/data/roads/EGCC-traffic.json');
const key = process.env.TOMTOM_KEY;
const approved = process.env.TOMTOM_PUBLISH_ALLOWED === 'true';

// The secret and publication flag are both required. Removing either also
// removes a snapshot restored from the Actions cache.
if (!key || !approved) {
  await rm(output, { force: true });
  console.log('TomTom traffic snapshot disabled.');
} else if (process.env.TOMTOM_FETCH_SLOT !== 'true') {
  console.log('TomTom traffic snapshot retained; this is not a scheduled fetch slot.');
} else {
  const url = new URL('https://api.tomtom.com/maps/orbis/traffic/incidents/details');
  url.searchParams.set('apiVersion', '2');
  url.searchParams.set('bbox', '-2.9,53.03,-1.65,53.70');
  url.searchParams.set('timeValidity', 'present');
  const response = await fetch(url, {
    headers: { 'TomTom-Api-Key': key, accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`TomTom incidents returned ${response.status}`);
  const snapshot = normalizeTomTom(await response.json());
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(snapshot)}\n`);
  console.log(`Published ${snapshot.disruptions.length} TomTom incidents.`);
}
