/**
 * AirLabs schedules → SetoffIQ's schedule entries.
 *
 * https://airlabs.co/docs/schedules — flights at an airport up to ten hours
 * ahead, with scheduled, estimated and actual times, a status of scheduled,
 * cancelled, active or landed, and delay in minutes. Free keys return at most
 * 50 results per request and the documentation marks only some fields as
 * available on the free plan, so every field here is read defensively: a
 * field the key does not return becomes null, never a guess.
 *
 * Codeshares: one operating flight is listed once per marketing number. The
 * rows carrying `cs_flight_iata` are those copies; they are folded into the
 * operating flight as aliases, so "BA1234" still finds the Iberia flight it is
 * sold on, and the list shows each aircraft once.
 */

const text = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);
const number = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/** "2026-09-11 20:40" in UTC → epoch ms, or null. */
export function utcToMs(value) {
  const raw = text(value);
  if (!raw) return null;
  const ms = Date.parse(`${raw.replace(' ', 'T')}:00Z`);
  return Number.isFinite(ms) ? ms : null;
}

const STATUSES = new Set(['scheduled', 'cancelled', 'active', 'landed']);

/**
 * @param {Record<string, unknown>[]} rows AirLabs `response` array
 * @param {'arrival' | 'departure'} direction relative to the airport queried
 * @param {(iata: string | null) => { icao: string, city: string | null, country: string | null } | null} placeFor
 */
export function toScheduleEntries(rows, direction, placeFor) {
  const operating = new Map();
  const aliases = new Map();

  for (const row of rows) {
    const flight = text(row.flight_iata);
    if (!flight) continue;
    const operatedAs = text(row.cs_flight_iata);
    if (operatedAs) {
      // A marketing copy: remember its number against the operating flight.
      const list = aliases.get(operatedAs) ?? [];
      list.push(flight);
      aliases.set(operatedAs, list);
      continue;
    }

    const other = direction === 'arrival' ? 'dep' : 'arr';
    const here = direction === 'arrival' ? 'arr' : 'dep';
    const status = text(row.status);

    operating.set(flight, {
      flight,
      callsign: text(row.flight_icao),
      airline: text(row.airline_iata),
      otherEnd: placeFor(text(row[`${other}_iata`])) ?? (text(row[`${other}_iata`]) ? { icao: null, iata: text(row[`${other}_iata`]), city: null, country: null } : null),
      scheduled: utcToMs(row[`${here}_time_utc`]),
      estimated: utcToMs(row[`${here}_estimated_utc`]),
      actual: utcToMs(row[`${here}_actual_utc`]),
      status: status && STATUSES.has(status) ? status : null,
      delayMinutes: number(row[`${here}_delayed`]) ?? number(row.delayed),
      terminal: text(row[`${here}_terminal`]),
      aliases: [],
    });
  }

  for (const [flight, list] of aliases) {
    const entry = operating.get(flight);
    if (entry) entry.aliases = [...new Set(list)];
  }

  return [...operating.values()]
    .filter((entry) => entry.scheduled !== null)
    .sort((a, b) => a.scheduled - b.scheduled);
}

/** Which schedule fields this key actually returned, for the first run's check. */
export function fieldsPresent(rows) {
  const seen = new Set();
  for (const row of rows) for (const [key, value] of Object.entries(row)) if (value !== null && value !== undefined && value !== '') seen.add(key);
  return [...seen].sort();
}
