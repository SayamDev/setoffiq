import { useState } from 'react';
import { formatAge, formatClock, formatDate } from '../domain/time';
import type { AirportProfile, Instant } from '../domain/types';
import {
  ARRIVAL_ESTIMATE,
  listInboundAircraft,
  loadArrivalHistory,
  loadSchedule,
  upcomingArrivals,
  minutesAgainstUsual,
  SnapshotTooOldError,
  USUAL_MIN_DAYS,
  usualArrivals,
  type ArrivalHistory,
  type FlightSchedule,
  type InboundAircraft,
  type ListedFlight,
  type UsualArrival,
} from '../services/flight';
import { describeScheduled, ScheduledList } from './ScheduledList';
import { Button, ui } from './ui';
import styles from './InboundPicker.module.css';

/** What a pick gives the form. */
export interface PickedFlight {
  flightNumber: string;
  /** The time to fill in, when there is one. */
  fillAt: Instant | null;
  /** Country at the other end of the flight, when known. */
  otherEndCountry: string | null;
  /**
   * Where the time came from: a live position, the recorded landing pattern,
   * or the recorded take-off pattern less the gate-to-take-off allowance.
   */
  basis: 'position' | 'schedule' | 'usual' | 'usual-departure';
}

type Live =
  | { kind: 'ok'; aircraft: InboundAircraft[] }
  | { kind: 'too-old'; ageMinutes: number }
  | { kind: 'error' };

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | {
      kind: 'ready';
      live: Live;
      /** undefined while the record is still loading; null if it could not be. */
      history: ArrivalHistory | null | undefined;
      usual: UsualArrival[];
      /** undefined while loading; null when there is no usable schedule. */
      schedule: FlightSchedule | null | undefined;
    }
  | { kind: 'picked'; title: string; detail: string };

/**
 * Pick the flight rather than type it.
 *
 * Two lists. Aircraft in the air now, from the live snapshot, with a time from
 * their position. And flights that usually land in the next twelve hours, from
 * SetoffIQ's own record of landings — a pattern it measured, labelled as one.
 * Neither is a schedule, and the interface says what each can and cannot know.
 */
export function InboundPicker({
  airport,
  onPick,
}: {
  airport: AirportProfile;
  onPick: (flight: PickedFlight) => void;
}): React.JSX.Element {
  const [state, setState] = useState<State>({ kind: 'idle' });

  const load = async (): Promise<void> => {
    setState({ kind: 'loading' });
    // The live list shows as soon as it is ready; the record of usual arrivals
    // follows when it arrives, rather than holding the live list back.
    const historyPromise = loadArrivalHistory();
    const schedulePromise = loadSchedule();
    const live = await listInboundAircraft(airport).then(
      (aircraft): Live => ({ kind: 'ok', aircraft }),
      (error: unknown): Live =>
        error instanceof SnapshotTooOldError
          ? { kind: 'too-old', ageMinutes: error.ageMinutes }
          : { kind: 'error' },
    );
    setState({ kind: 'ready', live, history: undefined, usual: [], schedule: undefined });

    const [history, schedule] = await Promise.all([historyPromise, schedulePromise]);
    const inTheAir = new Set(live.kind === 'ok' ? live.aircraft.map((a) => a.callsign) : []);
    const usual = history ? usualArrivals(history, airport, Date.now(), inTheAir) : [];
    setState((current) => (current.kind === 'ready' ? { ...current, history, usual, schedule } : current));
  };

  const pickLive = (aircraft: InboundAircraft): void => {
    onPick({
      flightNumber: aircraft.flightNumber ?? aircraft.callsign,
      fillAt: aircraft.estimatedArrival,
      otherEndCountry: aircraft.fromCountry,
      basis: 'position',
    });
    setState({
      kind: 'picked',
      title: describe(aircraft.flightNumber ?? aircraft.callsign, aircraft.airline, aircraft.from),
      detail: aircraft.estimatedArrival
        ? `Due on stand about ${formatClock(aircraft.estimatedArrival, airport.timeZone)}, from its position now.`
        : 'The flight number is filled in. Enter the time from the booking below.',
    });
  };

  const pickScheduled = (flight: ListedFlight): void => {
    onPick({
      flightNumber: flight.flight,
      fillAt: flight.scheduled,
      otherEndCountry: flight.otherEnd?.country ?? null,
      basis: 'schedule',
    });
    setState({
      kind: 'picked',
      title: describe(flight.flight, flight.airlineName, flight.place),
      detail: describeScheduled(flight, airport.timeZone, 'arrival'),
    });
  };

  const pickUsual = (flight: UsualArrival): void => {
    onPick({
      flightNumber: flight.flightNumber ?? flight.callsign,
      fillAt: flight.usualAt,
      otherEndCountry: flight.fromCountry,
      basis: 'usual',
    });
    setState({
      kind: 'picked',
      title: describe(flight.flightNumber ?? flight.callsign, flight.airline, flight.from),
      detail: `Usually lands around ${formatClock(flight.usualAt, airport.timeZone)} — seen on ${flight.daysSeen} of the last ${flight.daysConsidered} days. A pattern, not a schedule.`,
    });
  };

  if (state.kind === 'idle') {
    return (
      <button type="button" className={styles.entry} onClick={() => void load()}>
        <span className={styles.entryGlyph} aria-hidden="true">
          ✈
        </span>
        <span className={styles.entryText}>
          <span className={styles.entryTitle}>Collecting from a flight landing soon?</span>
          <span className={styles.entryBody}>
            Choose it from the arrivals at {airport.name} in the next ten hours — with delays and
            cancellations — and the flight and time are filled in for you.
          </span>
        </span>
      </button>
    );
  }

  if (state.kind === 'picked') {
    return (
      <div className={styles.picked} role="status">
        <p className={styles.pickedTitle}>{state.title}</p>
        <p className={ui.hint}>{state.detail}</p>
        <Button variant="quiet" onClick={() => void load()} className={styles.change}>
          Choose a different flight
        </Button>
      </div>
    );
  }

  if (state.kind === 'loading') {
    return (
      <div className={styles.wrapper}>
        <p className={ui.hint}>Checking what is in the air…</p>
      </div>
    );
  }

  const { live, history, usual, schedule } = state;
  const now = Date.now();

  return (
    <div className={styles.wrapper}>
      <h2 className={styles.sectionTitle}>In the air now</h2>
      {live.kind === 'too-old' ? (
        <p className={ui.hint}>
          {Number.isFinite(live.ageMinutes)
            ? `The latest flight data is ${formatAge(live.ageMinutes)} old, so it cannot show what is in the air now.`
            : 'The latest flight data has no timestamp, so it cannot show what is in the air now.'}
        </p>
      ) : null}
      {live.kind === 'error' ? (
        <p className={ui.hint}>We couldn't check what is in the air just now.</p>
      ) : null}
      {live.kind === 'ok' && live.aircraft.length === 0 ? (
        <p className={ui.hint}>No airline aircraft are heading for {airport.name} at the moment.</p>
      ) : null}
      {live.kind === 'ok' && live.aircraft.length > 0 ? (
        <>
          <p className={ui.hint}>
            Nearest first. Where a route is shown it is the one reported for that callsign, not a
            schedule, and some airlines broadcast a callsign that is not the number on a ticket.
          </p>
          <ul className={styles.list}>
            {live.aircraft.map((aircraft) => {
              const against = minutesAgainstUsual(
                history ?? null,
                aircraft.callsign,
                aircraft.estimatedArrival,
                airport,
                ARRIVAL_ESTIMATE.taxiMinutes,
              );
              return (
                <li key={aircraft.callsign}>
                  <button type="button" className={styles.option} onClick={() => pickLive(aircraft)}>
                    <span className={styles.identifier}>
                      {aircraft.flightNumber ?? aircraft.callsign}
                    </span>
                    <span className={styles.who}>
                      {aircraft.airline ? <span className={styles.airline}>{aircraft.airline}</span> : null}
                      {aircraft.from ? <span className={styles.origin}>from {aircraft.from}</span> : null}
                      {against !== null ? (
                        <span className={styles.notice}>
                          ~{Math.abs(against)} min {against > 0 ? 'later' : 'earlier'} than usual
                        </span>
                      ) : null}
                      {aircraft.flightNumber ? (
                        <span className={styles.callsign}>{aircraft.callsign}</span>
                      ) : (
                        <span className={styles.callsign}>callsign only</span>
                      )}
                    </span>
                    <span className={styles.detail}>{aircraft.distanceKm} km out</span>
                    <span className={styles.detail}>
                      {aircraft.estimatedArrival
                        ? `~${formatClock(aircraft.estimatedArrival, airport.timeZone)}`
                        : ''}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}

      {schedule === undefined ? (
        <p className={ui.hint}>Checking the schedule…</p>
      ) : schedule !== null ? (
        <>
          <h2 className={styles.sectionTitle}>Scheduled in the next ten hours</h2>
          <p className={ui.hint}>
            From AirLabs, as of {formatClock(Date.parse(schedule.generatedAt), airport.timeZone)}.
            Delays and cancellations can be a few hours old here; aircraft in the air above are
            live. Check with the airline before you set off.
          </p>
          <ScheduledList
            flights={upcomingArrivals(schedule, now)}
            airport={airport}
            direction="arrival"
            onPick={pickScheduled}
          />
        </>
      ) : (
        <UsualSection history={history} usual={usual} airport={airport} now={now} onPick={pickUsual} />
      )}
    </div>
  );
}

function UsualSection({
  history,
  usual,
  airport,
  now,
  onPick,
}: {
  history: ArrivalHistory | null | undefined;
  usual: UsualArrival[];
  airport: AirportProfile;
  now: number;
  onPick: (flight: UsualArrival) => void;
}): React.JSX.Element {
  return (
    <>
      <h2 className={styles.sectionTitle}>Usually in the next twelve hours</h2>
      {history === undefined ? (
        <p className={ui.hint}>Checking SetoffIQ's record of arrivals…</p>
      ) : history === null ? (
        <p className={ui.hint}>SetoffIQ's record of arrivals could not be loaded just now.</p>
      ) : usual.length === 0 ? (
        <p className={ui.hint}>
          SetoffIQ has been recording arrivals since{' '}
          {formatDate(Date.parse(`${history.recordingSince}T12:00:00Z`), airport.timeZone)}. A
          flight appears here once it has been seen landing on at least {USUAL_MIN_DAYS} of the last
          seven days. Until then, enter the time from the booking below.
        </p>
      ) : (
        <>
          <p className={ui.hint}>
            Flights SetoffIQ has seen land here at about the same time on most recent days. This is
            a pattern it recorded, not a schedule: it cannot see delays or cancellations until the
            aircraft is in the air, so check with the airline.
          </p>
          <ul className={styles.list}>
            {usual.map((flight) => (
              <li key={flight.callsign}>
                <button type="button" className={styles.option} onClick={() => onPick(flight)}>
                  <span className={styles.identifier}>{flight.flightNumber ?? flight.callsign}</span>
                  <span className={styles.who}>
                    {flight.airline ? <span className={styles.airline}>{flight.airline}</span> : null}
                    {flight.from ? <span className={styles.origin}>from {flight.from}</span> : null}
                    {flight.status === 'not-seen-yet' ? (
                      <span className={styles.notice}>
                        Not seen yet — late, cancelled or not flying today
                      </span>
                    ) : null}
                    <span className={styles.callsign}>
                      {flight.daysSeen} of {flight.daysConsidered} days
                    </span>
                  </span>
                  <span className={styles.detail}>
                    {formatDate(flight.usualAt, airport.timeZone) === formatDate(now, airport.timeZone)
                      ? 'usually'
                      : 'tomorrow'}
                  </span>
                  <span className={styles.detail}>~{formatClock(flight.usualAt, airport.timeZone)}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

export function describe(identifier: string, airline: string | null, from: string | null): string {
  return [identifier, airline ? `· ${airline}` : null, from ? `from ${from}` : null].filter(Boolean).join(' ');
}
