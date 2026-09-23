import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeTomTom } from './tomtom.mjs';

test('normalizes a nearby accident and excludes a distant incident', () => {
  const snapshot = normalizeTomTom({ incidents: [
    { geometry: { type: 'Point', coordinates: [-2.275, 53.354] }, properties: { id: 'a', iconCategory: 'accident', events: [{ description: 'Accident' }], roadNumbers: ['M56'], timeValidity: 'present' } },
    { geometry: { type: 'Point', coordinates: [-1, 54] }, properties: { id: 'b', iconCategory: 'jam' } },
  ] }, 123);
  assert.equal(snapshot.generatedAt, 123);
  assert.equal(snapshot.disruptions.length, 1);
  assert.equal(snapshot.disruptions[0].category, 'incident');
  assert.equal(snapshot.disruptions[0].road, 'M56');
});

test('rejects malformed responses rather than publishing a false clear snapshot', () => {
  assert.throws(() => normalizeTomTom({}), /incidents array/);
});
