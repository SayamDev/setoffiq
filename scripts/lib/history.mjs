/**
 * SetoffIQ's own record of arrivals at the airport.
 *
 * No free source says what lands later today, but the snapshot job already sees
 * every aircraft near Manchester four times an hour. Each run notes the ones
 * landing, and the record says which callsigns have landed on which days and
 * at roughly what time. The app turns that into "usually lands around 21:40 —
 * seen on 6 of the last 7 days": a pattern it measured, labelled as a pattern,
 * never presented as a schedule.
 *
 * Precision is the job's cadence: GitHub runs it about every fifteen minutes,
 * sometimes later, so a landing is known to within roughly a quarter of an hour.
 */

/** How long the record is kept. Two weeks shows a weekly pattern twice. */
export const KEEP_DAYS = 14;

/** An aircraft this close and this low, descending, is on final approach. */
const FINAL_KM = 15;
const FINAL_BELOW_M = 1200;
/**
 * An aircraft reported as routed here, descending within this distance, is on
 * its way in. A final approach lasts about four minutes and the job runs every
 * fifteen, so waiting for final alone would miss most landings; within 60 km an
 * arrival spends twelve minutes or more, and is almost always seen once.
 */
const INBOUND_KM = 60;
const INBOUND_BELOW_M = 5000;
/** On the ground within this distance is at the airport, not another field. */
const ON_AIRPORT_KM = 5;

/** Touchdown from position: direct inside 25 km, vectored and a final beyond. */
function minutesToTouchdown(distanceKm, groundSpeedMps) {
  const speedKph = (groundSpeedMps && groundSpeedMps > 30 ? groundSpeedMps : 70) * 3.6;
  return distanceKm <= 25 ? (distanceKm / speedKph) * 60 : ((distanceKm * 1.15) / speedKph) * 60 + 8;
}

function haversineKm(a, b) {
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const deltaLat = toRadians(b.latitude - a.latitude);
  const deltaLon = toRadians(b.longitude - a.longitude);
  const h =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(deltaLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Local calendar date and minute of the day, in the airport's timezone. */
export function localDayAndMinute(instantMs, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(instantMs))
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minute: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

/**
 * Aircraft in this snapshot that are landing here, with an approximate
 * touchdown time and how far out they were when it was worked out.
 *
 * - On the ground at the airport with a reported route *to* here: arrived.
 *   (A route *from* here on the ground is a departure taxiing out.)
 * - Descending, low and close: on final. The route need not be known —
 *   nothing else is that low, that close and still coming down.
 * - Descending within 60 km with a reported route here: on its way in.
 */
export function detectArrivals(aircraft, airport) {
  const found = [];
  for (const entry of aircraft) {
    const distanceKm = haversineKm(entry, airport);
    const seenAt = entry.lastContact * 1000;
    const routedHere = entry.route?.to?.icao === airport.icao;

    if (entry.onGround) {
      if (routedHere && distanceKm <= ON_AIRPORT_KM) {
        found.push({ callsign: entry.callsign, at: seenAt, route: entry.route, km: 0 });
      }
      continue;
    }

    const height = entry.baroAltitudeM ?? entry.geoAltitudeM;
    const descending = entry.verticalRateMps !== null && entry.verticalRateMps < 0;
    if (height === null || !descending) continue;

    const onFinal = height < FINAL_BELOW_M && distanceKm <= FINAL_KM;
    const onTheWayIn = routedHere && height < INBOUND_BELOW_M && distanceKm <= INBOUND_KM;
    if (onFinal || onTheWayIn) {
      found.push({
        callsign: entry.callsign,
        at: seenAt + Math.round(minutesToTouchdown(distanceKm, entry.groundSpeedMps) * 60_000),
        route: entry.route ?? null,
        km: Math.round(distanceKm),
      });
    }
  }
  return found;
}

/** Climbing away, low and close, is a take-off from here: nothing else is. */
const CLIMB_OUT_KM = 15;
const CLIMB_OUT_BELOW_M = 1500;
/** Routed from here and climbing within this distance: recently departed. */
const OUTBOUND_KM = 60;
const OUTBOUND_BELOW_M = 6000;

/**
 * Aircraft in this snapshot that have just taken off from here, with an
 * approximate take-off time worked back from distance and speed.
 *
 * The mirror of detectArrivals. On the ground is not counted: an aircraft
 * taxiing out has not left, and nothing says when it will.
 */
export function detectDepartures(aircraft, airport) {
  const found = [];
  for (const entry of aircraft) {
    if (entry.onGround) continue;
    const height = entry.baroAltitudeM ?? entry.geoAltitudeM;
    const climbing = entry.verticalRateMps !== null && entry.verticalRateMps > 1;
    if (height === null || !climbing) continue;

    const distanceKm = haversineKm(entry, airport);
    const routedFromHere = entry.route?.from?.icao === airport.icao;
    const justOff = height < CLIMB_OUT_BELOW_M && distanceKm <= CLIMB_OUT_KM;
    const onTheWayOut = routedFromHere && height < OUTBOUND_BELOW_M && distanceKm <= OUTBOUND_KM;
    if (!justOff && !onTheWayOut) continue;

    const speedKph = (entry.groundSpeedMps && entry.groundSpeedMps > 30 ? entry.groundSpeedMps : 90) * 3.6;
    const minutesSinceTakeoff = ((distanceKm * 1.1) / speedKph) * 60;
    found.push({
      callsign: entry.callsign,
      at: entry.lastContact * 1000 - Math.round(minutesSinceTakeoff * 60_000),
      route: entry.route ?? null,
      km: Math.round(distanceKm),
    });
  }
  return found;
}

function foldSightings(records, sightings, timeZone, endKey) {
  for (const sighting of sightings) {
    const { date, minute } = localDayAndMinute(sighting.at, timeZone);
    const record = (records[sighting.callsign] ??= { [endKey]: null, landings: [] });
    const end = sighting.route?.[endKey];
    if (end) record[endKey] = { icao: end.icao, city: end.city ?? null, country: end.country ?? null };
    // One a day; the sighting nearest the airport gives the best time.
    const sameDay = record.landings.find((entry) => entry.date === date);
    if (!sameDay) record.landings.push({ date, minute, km: sighting.km });
    else if (sighting.km < (sameDay.km ?? Number.POSITIVE_INFINITY)) {
      sameDay.minute = minute;
      sameDay.km = sighting.km;
    }
  }
}

function prune(records, oldest) {
  for (const [callsign, record] of Object.entries(records)) {
    record.landings = record.landings.filter((entry) => entry.date >= oldest).sort((a, b) => (a.date < b.date ? -1 : 1));
    if (record.landings.length === 0) delete records[callsign];
  }
}

/**
 * Fold this run's arrivals and departures into the record, one a day per
 * callsign (timed from the sighting closest to the airport), and drop days
 * older than KEEP_DAYS.
 */
export function mergeHistory(previous, arrivals, nowMs, timeZone, airportIcao, departures = []) {
  const flights = structuredClone(previous?.flights ?? {});
  // Departures use the same shape, keyed on where they go rather than come
  // from; "landings" is the list of days seen, whichever way the flight went.
  const outbound = structuredClone(previous?.departures ?? {});

  foldSightings(flights, arrivals, timeZone, 'from');
  foldSightings(outbound, departures, timeZone, 'to');

  const oldest = localDayAndMinute(nowMs - KEEP_DAYS * 86_400_000, timeZone).date;
  prune(flights, oldest);
  prune(outbound, oldest);

  return {
    generatedAt: new Date(nowMs).toISOString(),
    airportIcao,
    timeZone,
    // Kept from the first record, so the app can say how long it has been watching.
    recordingSince: previous?.recordingSince ?? localDayAndMinute(nowMs, timeZone).date,
    keepDays: KEEP_DAYS,
    license: 'ODbL-1.0',
    attribution: 'Derived by SetoffIQ from adsb.lol aircraft data (ODbL 1.0)',
    flights,
    // Recording of departures began later than arrivals.
    departuresSince: previous?.departuresSince ?? localDayAndMinute(nowMs, timeZone).date,
    departures: outbound,
  };
}
