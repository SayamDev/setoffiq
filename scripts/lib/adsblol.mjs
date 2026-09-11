/**
 * adsb.lol aircraft → the snapshot's aircraft shape.
 *
 * adsb.lol serves readsb's JSON (the ADSBexchange v2 format): altitudes in
 * feet, with the string "ground" for an aircraft on the ground; ground speed in
 * knots; climb rate in feet per minute; `seen_pos` in seconds since the last
 * position. The snapshot keeps the metric units the app has always used, so
 * nothing downstream of this file changes with the source.
 */

const FEET_TO_M = 0.3048;
const KNOTS_TO_MPS = 0.514444;
const FPM_TO_MPS = 0.00508;

/** Positions older than this in the response are not worth publishing. */
const MAX_POSITION_AGE_S = 60;

export function haversineKm(a, b) {
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const deltaLat = toRadians(b.latitude - a.latitude);
  const deltaLon = toRadians(b.longitude - a.longitude);
  const h =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(deltaLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

const number = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/**
 * @param {Record<string, unknown>} ac one entry of the response's `ac` array
 * @param {number} nowMs the response's `now`, in milliseconds
 * @param {{ latitude: number, longitude: number }} airport
 * @param {number} radiusKm
 */
export function toSnapshotAircraft(ac, nowMs, airport, radiusKm) {
  const callsign = typeof ac.flight === 'string' ? ac.flight.trim() : '';
  const latitude = number(ac.lat);
  const longitude = number(ac.lon);
  if (!callsign || latitude === null || longitude === null) return null;

  const positionAge = number(ac.seen_pos) ?? number(ac.seen) ?? 0;
  if (positionAge > MAX_POSITION_AGE_S) return null;

  const distanceKm = haversineKm({ latitude, longitude }, airport);
  if (distanceKm > radiusKm) return null;

  const onGround = ac.alt_baro === 'ground';
  const baroFeet = number(ac.alt_baro);
  const geoFeet = number(ac.alt_geom);
  const baroAltitudeM = baroFeet === null ? null : Math.round(baroFeet * FEET_TO_M);

  const knots = number(ac.gs);
  const feetPerMinute = number(ac.baro_rate) ?? number(ac.geom_rate);
  const track = number(ac.track);

  return {
    callsign,
    icao24: String(ac.hex ?? '').replace(/^~/, ''),
    latitude: Number(latitude.toFixed(4)),
    longitude: Number(longitude.toFixed(4)),
    baroAltitudeM: onGround ? null : baroAltitudeM,
    geoAltitudeM: geoFeet === null ? null : Math.round(geoFeet * FEET_TO_M),
    groundSpeedMps: knots === null ? null : Math.round(knots * KNOTS_TO_MPS),
    verticalRateMps: feetPerMinute === null ? null : Number((feetPerMinute * FPM_TO_MPS).toFixed(1)),
    // Without it, an aircraft passing Manchester on its way to Birmingham is
    // indistinguishable from one arriving here.
    trueTrackDeg: track === null ? null : Math.round(track),
    onGround,
    lastContact: Math.floor(nowMs / 1000 - positionAge),
  };
}

/**
 * Whether an aircraft belongs in the published snapshot.
 *
 * Near the airport, everything with a callsign except cruising overflights.
 * Further out, only aircraft whose reported route touches this airport: the
 * wider circle exists to see arrivals earlier, not to publish every flight
 * over Britain, Ireland and the Low Countries.
 *
 * @param {{ baroAltitudeM: number | null, route?: { from: { icao: string }, to: { icao: string } } | null }} aircraft
 * @param {number} distanceKm
 * @param {string} airportIcao
 */
export function keepInSnapshot(aircraft, distanceKm, airportIcao) {
  const route = aircraft.route;
  if (route && (route.to.icao === airportIcao || route.from.icao === airportIcao)) return true;
  if (distanceKm > NEAR_RADIUS_KM) return false;
  // Cruising far above the airport: an overflight, not an arrival.
  if (aircraft.baroAltitudeM !== null && aircraft.baroAltitudeM > 12000 && distanceKm > 120) return false;
  return true;
}

/** Inside this, every aircraft with a callsign is kept whatever its route. */
export const NEAR_RADIUS_KM = 300;

