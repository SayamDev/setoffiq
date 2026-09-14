/**
 * AirLabs routes → SetoffIQ's timetable entries.
 *
 * https://airlabs.co/docs/routes — the airlines' weekly timetable: which
 * flights operate between two airports, on which days of the week, at what
 * time. It carries no status at all, so it can never say whether a flight is
 * delayed or cancelled; what it can do is answer "what lands here tomorrow
 * morning", which `/schedules` cannot, because a free key sees only about
 * three hours ahead.
 *
 * Codeshares are folded the same way as in the schedule: a row carrying
 * `cs_flight_iata` is a marketing copy, and its number becomes an alias of the
 * flight that actually operates.
 */

const text = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);
const number = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** "07:30" → 450 minutes after midnight, or null. */
export function minuteOfDay(value) {
  const raw = text(value);
  if (!raw) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * How long the flight takes, from the published duration when there is one and
 * otherwise from the two clock times — which wrap when the flight lands the
 * next day.
 */
function durationOf(row, departure, arrival) {
  const published = number(row.duration);
  if (published !== null && published > 0) return published;
  if (departure === null || arrival === null) return null;
  const gap = arrival - departure;
  return gap >= 0 ? gap : gap + 24 * 60;
}

/**
 * @param {Record<string, unknown>[]} rows AirLabs `response` array
 * @param {'arrival' | 'departure'} direction relative to Manchester
 * @param {(iata: string | null) => { icao: string, iata: string, city: string | null, country: string | null } | null} placeFor
 */
export function toTimetableEntries(rows, direction, placeFor) {
  const operating = new Map();
  const aliases = new Map();

  for (const row of rows) {
    const flight = text(row.flight_iata);
    if (!flight) continue;
    const operatedAs = text(row.cs_flight_iata);
    if (operatedAs) {
      const list = aliases.get(operatedAs) ?? [];
      list.push(flight);
      aliases.set(operatedAs, list);
      continue;
    }

    const days = Array.isArray(row.days) ? row.days.filter((day) => DAYS.includes(day)) : [];
    const departureMinute = minuteOfDay(row.dep_time_utc);
    const arrivalMinute = minuteOfDay(row.arr_time_utc);
    if (!days.length || departureMinute === null) continue;

    const otherIata = text(direction === 'arrival' ? row.dep_iata : row.arr_iata);
    const terminals = direction === 'arrival' ? row.arr_terminals : row.dep_terminals;

    // One flight number can be timetabled twice — a different time on
    // different days. Both are kept; the key is the number and the time.
    const key = `${flight}@${departureMinute}`;
    operating.set(key, {
      flight,
      callsign: text(row.flight_icao),
      airline: text(row.airline_iata),
      otherEnd:
        placeFor(otherIata) ?? (otherIata ? { icao: null, iata: otherIata, city: null, country: null } : null),
      days,
      departureMinute,
      durationMinutes: durationOf(row, departureMinute, arrivalMinute),
      terminal: Array.isArray(terminals) && terminals.length === 1 ? text(terminals[0]) : null,
      aliases: [],
    });
  }

  for (const [flight, list] of aliases) {
    for (const entry of operating.values()) {
      if (entry.flight === flight) entry.aliases = [...new Set([...entry.aliases, ...list])];
    }
  }

  return [...operating.values()]
    .filter((entry) => direction === 'departure' || entry.durationMinutes !== null)
    .sort((a, b) => a.departureMinute - b.departureMinute || a.flight.localeCompare(b.flight));
}
