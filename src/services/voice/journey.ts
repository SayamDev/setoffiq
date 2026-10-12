import { DEFAULT_AIRPORT } from '../../domain/airports';
import {
  formatClock,
  formatClockRange,
  parseLocalDateTime,
  todayInZone,
} from '../../domain/time';
import { validateScheduledTime } from '../../domain/scheduleWindow';
import type { GeoPoint, JourneyInput, JourneyKind } from '../../domain/types';
import { listInboundAircraft } from '../flight/inbound';
import { operatorName } from '../flight/operators';
import { normaliseFlightNumber } from '../flight/callsigns';
import { loadSchedule } from '../flight/schedule';
import {
  loadTimetable,
  timetableWindow,
  withoutScheduled,
} from '../flight/timetable';
import { geocodePostcode, isValidPostcodeShape } from '../routing';
import type { JourneyPlan } from '../plan';
import type { VoicePatch } from './parser';

export interface VoiceDraft extends VoicePatch {
  kind: JourneyKind;
  date: string;
  time: string;
  postcode: string;
}
export interface VoiceFlight {
  number: string;
  aliases: string[];
  airline: string | null;
  place: string | null;
  country: string | null;
  at: number;
  terminal: string | null;
  basis: 'schedule' | 'timetable' | 'position';
}
const zone = DEFAULT_AIRPORT.timeZone;
const normalise = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/** Exact identifiers or complete place/name tokens. Never fuzzy-match a mishearing. */
export function matchVoiceFlights(
  draft: VoiceDraft,
  flights: VoiceFlight[],
): VoiceFlight[] {
  if (!draft.flightNumber && !draft.airline && !draft.place) return [];
  const at = draft.time
    ? parseLocalDateTime(draft.date, draft.time, zone)
    : null;
  return flights
    .filter((flight) => {
      if (todayInZone(flight.at, zone) !== draft.date) return false;
      if (
        draft.flightNumber &&
        ![flight.number, ...flight.aliases].some(
          (number) =>
            normaliseFlightNumber(number) ===
            normaliseFlightNumber(draft.flightNumber!),
        )
      )
        return false;
      if (
        draft.airline &&
        !normalise(flight.airline ?? '').includes(normalise(draft.airline))
      )
        return false;
      if (
        draft.place &&
        normalise(flight.place ?? '') !== normalise(draft.place)
      )
        return false;
      // A wider gap is a mismatch worth showing, not a licence to choose the nearest aircraft.
      return at === null || Math.abs(flight.at - at) <= 90 * 60000;
    })
    .filter(
      (flight, index, all) =>
        all.findIndex(
          (other) =>
            normaliseFlightNumber(other.number) ===
              normaliseFlightNumber(flight.number) &&
            Math.abs(other.at - flight.at) < 6 * 3600000,
        ) === index,
    );
}

export async function loadVoiceFlights(
  draft: VoiceDraft,
  signal: AbortSignal,
): Promise<VoiceFlight[]> {
  const anchor = parseLocalDateTime(draft.date, '00:00', zone)!;
  const [schedule, timetable, aircraft] = await Promise.all([
    loadSchedule(signal),
    loadTimetable(signal),
    draft.kind === 'pickup' && draft.date === todayInZone(Date.now(), zone)
      ? listInboundAircraft(DEFAULT_AIRPORT, signal).catch(() => [])
      : Promise.resolve([]),
  ]);
  const list =
    (draft.kind === 'pickup' ? schedule?.arrivals : schedule?.departures) ?? [];
  const scheduled: VoiceFlight[] = list.map((flight) => ({
    number: flight.flight,
    aliases: flight.aliases,
    airline:
      (flight.callsign ? operatorName(flight.callsign) : null) ??
      (
        {
          FR: 'Ryanair',
          RK: 'Ryanair',
          U2: 'Easyjet',
          EK: 'Emirates',
          KL: 'KLM',
          BA: 'British Airways',
        } as Record<string, string>
      )[flight.airline ?? ''] ??
      flight.airline,
    place: flight.otherEnd?.city ?? flight.otherEnd?.iata ?? null,
    country: flight.otherEnd?.country ?? null,
    at: flight.scheduled,
    terminal: flight.terminal,
    basis: 'schedule',
  }));
  const timetabled: VoiceFlight[] = timetable
    ? withoutScheduled(
        timetableWindow(
          timetable,
          draft.kind === 'pickup' ? 'arrival' : 'departure',
          anchor,
          26,
          0,
        ),
        list,
      ).map((flight) => ({
        number: flight.flight,
        aliases: flight.aliases,
        airline: flight.airlineName,
        place: flight.place,
        country: flight.otherEnd?.country ?? null,
        at: flight.at,
        terminal: flight.terminal,
        basis: 'timetable',
      }))
    : [];
  const positioned: VoiceFlight[] = aircraft
    .filter((flight) => flight.estimatedArrival !== null)
    .map((flight) => ({
      number: flight.flightNumber ?? flight.callsign,
      aliases: [flight.callsign],
      airline: flight.airline,
      place: flight.from,
      country: flight.fromCountry,
      at: flight.estimatedArrival!,
      terminal: null,
      basis: 'position',
    }));
  // Prefer the existing schedule/timetable's booking time over a position estimate.
  return matchVoiceFlights(draft, [...scheduled, ...timetabled, ...positioned]);
}

export function chooseVoiceFlight(
  draft: VoiceDraft,
  flight: VoiceFlight,
): VoiceDraft {
  const raw = flight.terminal?.toUpperCase() ?? '';
  const terminal = raw.startsWith('T') ? raw : `T${raw}`;
  return {
    ...draft,
    flightNumber: flight.number,
    airline: undefined,
    place: flight.place ?? undefined,
    time: draft.time || formatClock(flight.at, zone),
    passengerRoute:
      draft.passengerRoute ??
      (flight.country === 'GB' ? 'domestic' : 'international'),
    terminalCode:
      draft.terminalCode ??
      (DEFAULT_AIRPORT.terminals.some((t) => t.code === terminal)
        ? terminal
        : undefined),
  };
}

/** Validate at the action boundary before providers or the engine see input. */
export async function voiceJourneyInput(
  draft: VoiceDraft,
  now: number,
  signal?: AbortSignal,
  knownOrigin?: GeoPoint,
): Promise<JourneyInput | string> {
  if (!/^\d{2}:\d{2}$/.test(draft.time) || !draft.date)
    return 'What is the flight landing or departure date and time?';
  const at = parseLocalDateTime(draft.date, draft.time, zone);
  if (
    at === null ||
    formatClock(at, zone) !== draft.time ||
    todayInZone(at, zone) !== draft.date
  )
    return 'That date or time is not valid in Manchester. Check the controls.';
  if (
    [at - 3600000, at + 3600000].some(
      (other) =>
        formatClock(other, zone) === draft.time &&
        todayInZone(other, zone) === draft.date,
    )
  ) {
    return 'That Manchester clock time occurs twice when the clocks change. Confirm the flight with the airline; voice cannot choose which occurrence. Use the original journey form after checking.';
  }
  const problem = validateScheduledTime(draft.kind, at, now);
  if (problem) return problem.message;
  if (!isValidPostcodeShape(draft.postcode))
    return 'Enter your starting postcode below. It is used for the drive, never sent to a language model.';
  if (
    draft.flightNumber &&
    !/^[A-Z0-9]{2,3}\d{1,4}[A-Z]{0,2}$/.test(draft.flightNumber)
  )
    return 'Check the flight number, or clear it to use your stated time.';
  if (
    draft.terminalCode &&
    !DEFAULT_AIRPORT.terminals.some((t) => t.code === draft.terminalCode)
  )
    return 'Choose a Manchester terminal from the controls.';
  const origin =
    knownOrigin?.label.replace(/\s/g, '').toUpperCase() ===
    draft.postcode.replace(/\s/g, '').toUpperCase()
      ? knownOrigin
      : (await geocodePostcode(draft.postcode, signal)).value;
  if (!origin)
    return 'We could not look up that postcode. Check it and try again.';
  return {
    kind: draft.kind,
    airportIata: DEFAULT_AIRPORT.iataCode,
    scheduledTime: at,
    flightNumber: draft.flightNumber || null,
    origin,
    passengerRoute: draft.passengerRoute ?? 'international',
    terminalCode: draft.terminalCode ?? null,
    luggage: draft.luggage ?? null,
    pickupMode: draft.kind === 'pickup' ? 'quick-pickup' : null,
    dropoffMode: draft.kind === 'dropoff' ? 'drop-off' : null,
    scenarioId: null,
  };
}

/** Speech reads engine output, including confidence and fallback, without changing a number. */
export function voiceAnswer(plan: JourneyPlan): string {
  const result = plan.recommendation;
  if (result.kind === 'unavailable')
    return `${result.headline}. ${result.detail}`;
  return `${result.advisory.headline}. Set off at ${formatClock(result.recommendedDeparture, zone)}, ${todayInZone(result.recommendedDeparture, zone)}, Manchester time. ${result.confidence.level[0]!.toUpperCase()}${result.confidence.level.slice(1)} confidence. ${result.kind === 'pickup' ? `Passenger likely ready ${formatClockRange(result.readiness.window, zone)}.` : ''} ${plan.flight.message ?? ''}`;
}
