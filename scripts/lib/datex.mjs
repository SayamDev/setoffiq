/**
 * Parse National Highways' Road and Lane Closures feed.
 *
 * The feed is DATEX II v3.4 with National Highways extensions, served as JSON.
 * This is written against the sample payloads published on the API's own
 * documentation page, and is exercised by scripts/lib/datex.test.mjs using
 * those samples — so the mapping is verified even though no key exists yet.
 *
 * Shape, abbreviated:
 *
 *   D2Payload
 *     publicationTime
 *     situation[]
 *       idG
 *       situationRecord[]
 *         sit<RecordType>              ← the key names the record type
 *           validity.validityStatus     planned | active | suspended
 *           validity.validityTimeSpecification.overallStartTime / overallEndTime
 *           generalPublicComment[].comment
 *           locationReference
 *             locLocationGroupByList.locationContainedInGroup[]   ← many locations
 *             locLinearLocation                                   ← one location
 *               gmlLineString.locGmlLineString.posList  "lat lon lat lon …"
 *               supplementaryPositionalDescription.locationDescription
 *             locSingleRoadLinearLocation
 *               .linearWithinLinearElement[].linearElement.locLinearElementByCode.roadName
 */

const EARTH_RADIUS_KM = 6371;

export function haversineKm(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function toInstant(value) {
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * A situationRecord entry wraps its body in a single key naming the record
 * type — `sitRoadOrCarriagewayOrLaneManagement` for closures, something else
 * for other record types. Unwrap without depending on which.
 */
function recordBody(entry) {
  if (!entry || typeof entry !== 'object') return null;
  if (entry.validity || entry.locationReference) return entry;
  const values = Object.values(entry).filter((value) => value && typeof value === 'object');
  return values.find((value) => value.validity || value.locationReference) ?? values[0] ?? null;
}

/** Every location a record describes, whether it carries one or several. */
function locationsOf(body) {
  const reference = body?.locationReference;
  if (!reference) return [];
  const grouped = reference.locLocationGroupByList?.locationContainedInGroup;
  if (Array.isArray(grouped) && grouped.length > 0) return grouped;
  if (reference.locLinearLocation || reference.locSingleRoadLinearLocation) return [reference];
  return [];
}

/**
 * `posList` is a GML position list: whitespace-separated numbers, in
 * latitude/longitude pairs, WGS84 (the feed states srsName "EPSG::4326").
 */
export function firstCoordinate(posList) {
  if (typeof posList !== 'string') return null;
  const parts = posList.trim().split(/\s+/).map(Number);
  if (parts.length < 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return null;
  const [latitude, longitude] = parts;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

function roadNameOf(location) {
  const elements = location?.locSingleRoadLinearLocation?.linearWithinLinearElement;
  if (Array.isArray(elements)) {
    for (const element of elements) {
      const name = element?.linearElement?.locLinearElementByCode?.roadName;
      if (typeof name === 'string' && name.trim()) return name.trim();
    }
  }
  // Fall back to the leading token of the human description, e.g. "M56 …".
  const description = location?.locLinearLocation?.supplementaryPositionalDescription?.locationDescription;
  const match = /^([AMB]\d{1,4}\(?M?\)?)\b/.exec(String(description ?? '').trim());
  return match ? match[1] : null;
}

function descriptionOf(body, location) {
  const comment = body?.generalPublicComment?.[0]?.comment;
  if (typeof comment === 'string' && comment.trim()) {
    // Comments are multi-line; the first line is the useful summary.
    return comment.trim().split('\n')[0].trim();
  }
  const described = location?.locLinearLocation?.supplementaryPositionalDescription?.locationDescription;
  return typeof described === 'string' && described.trim() ? described.trim() : null;
}

function categoryOf(body, closureType) {
  const cause = body?.cause?.causeType ?? '';
  const source = body?.source?.sourceIdentification ?? '';
  const text = `${cause} ${source}`.toLowerCase();
  if (text.includes('accident') || text.includes('incident')) return 'incident';
  if (text.includes('maintenance') || text.includes('roadwork')) return 'roadworks';
  // The request already told us which kind we asked for.
  return closureType === 'unplanned' ? 'closure' : 'roadworks';
}

/**
 * Normalise a payload into SetoffIQ's domain shape.
 *
 * Records are dropped rather than guessed at when they cannot be placed on the
 * map or described, because a disruption shown to a driver has to be real.
 */
export function parseClosures(payload, options) {
  const { now, airport, radiusKm, closureType = 'planned' } = options;
  const root = payload?.D2Payload ?? payload?.d2Payload ?? payload ?? {};
  const situations = Array.isArray(root.situation) ? root.situation : [];

  const results = [];

  for (const situation of situations) {
    const records = Array.isArray(situation?.situationRecord) ? situation.situationRecord : [];

    for (const entry of records) {
      const body = recordBody(entry);
      if (!body) continue;

      const status = body.validity?.validityStatus ?? null;
      // A cancelled record is not a disruption.
      if (status === 'suspended') continue;

      const startedAt = toInstant(body.validity?.validityTimeSpecification?.overallStartTime);
      const expectedEndAt = toInstant(body.validity?.validityTimeSpecification?.overallEndTime);

      /*
       * The feed keeps completed closures marked 'active' for seven days after
       * the works ended, so status alone would show week-old roadworks as
       * current. The end time is what decides it.
       */
      if (expectedEndAt !== null && expectedEndAt < now) continue;
      // Not started yet, and not starting soon enough to matter for this drive.
      if (startedAt !== null && startedAt > now + 6 * 60 * 60_000) continue;

      for (const location of locationsOf(body)) {
        const posList =
          location?.locLinearLocation?.gmlLineString?.locGmlLineString?.posList ??
          location?.gmlLineString?.locGmlLineString?.posList;
        const coordinate = firstCoordinate(posList);
        if (!coordinate) continue;

        const distanceFromAirportKm = haversineKm(coordinate, airport);
        if (distanceFromAirportKm > radiusKm) continue;

        const description = descriptionOf(body, location);
        const road = roadNameOf(location);
        if (!description || !road) continue;

        results.push({
          id: String(body.idG ?? situation.idG ?? `${results.length}`),
          road,
          category: categoryOf(body, closureType),
          description,
          distanceFromAirportKm: Math.round(distanceFromAirportKm),
          startedAt,
          expectedEndAt,
          active: status === 'active',
        });
        // One entry per record is enough; further locations are the same works.
        break;
      }
    }
  }

  /*
   * Deduplicate on content rather than id. National Highways models a single
   * set of works as several situationRecords — one per lane, or per time
   * period — each with its own idG, so an id-based key lets the same closure
   * through four times. A driver cares that the M67 has a lane shut, not how
   * the publisher chose to split the record.
   */
  const seen = new Set();
  return results.filter((entry) => {
    const key = `${entry.road}|${entry.description}|${entry.distanceFromAirportKm}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
