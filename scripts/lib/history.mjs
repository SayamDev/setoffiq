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

/**
 * Fold this run's arrivals into the record, one landing per callsign per
 * local day (from the sighting closest to the airport), and drop days older
 * than KEEP_DAYS.
 */
export function mergeHistory(previous, arrivals, nowMs, timeZone, airportIcao) {
  const flights = structuredClone(previous?.flights ?? {});

  for (const arrival of arrivals) {
    const { date, minute } = localDayAndMinute(arrival.at, timeZone);
    const record = (flights[arrival.callsign] ??= { from: null, landings: [] });
    if (arrival.route?.from) {
      const from = arrival.route.from;
      record.from = { icao: from.icao, city: from.city ?? null, country: from.country ?? null };
    }
    // One landing a day; the sighting nearest the airport gives the best time.
    const sameDay = record.landings.find((landing) => landing.date === date);
    if (!sameDay) record.landings.push({ date, minute, km: arrival.km });
    else if (arrival.km < (sameDay.km ?? Number.POSITIVE_INFINITY)) {
      sameDay.minute = minute;
      sameDay.km = arrival.km;
    }
  }

  const oldest = localDayAndMinute(nowMs - KEEP_DAYS * 86_400_000, timeZone).date;
  for (const [callsign, record] of Object.entries(flights)) {
    record.landings = record.landings.filter((landing) => landing.date >= oldest).sort((a, b) => (a.date < b.date ? -1 : 1));
    if (record.landings.length === 0) delete flights[callsign];
  }

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
  };
}
