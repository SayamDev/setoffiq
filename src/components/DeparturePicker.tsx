import { useState } from 'react';
import { GATE_TO_TAKEOFF_MINUTES } from '../domain/assumptions';
import { formatClock, formatDate } from '../domain/time';
import type { AirportProfile } from '../domain/types';
import { loadArrivalHistory, USUAL_MIN_DAYS, usualDepartures, type UsualDeparture } from '../services/flight';
import { describe, type PickedFlight } from './InboundPicker';
import { Button, ui } from './ui';
import styles from './InboundPicker.module.css';

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; since: string | null; departures: UsualDeparture[] }
  | { kind: 'unavailable' }
  | { kind: 'picked'; title: string; detail: string };

/**
 * The drop-off side of the picker: flights that usually leave in the next
 * twelve hours, from SetoffIQ's own record of take-offs.
 *
 * There is no live list here — a departure is not in the air until it has
 * gone. And the record sees take-off, not the gate time on a booking, so the
 * time filled in is the usual take-off less a gate-to-take-off allowance, at
 * the cautious end: too early costs a wait, too late costs the flight.
 */
export function DeparturePicker({
  airport,
  onPick,
}: {
  airport: AirportProfile;
  onPick: (flight: PickedFlight) => void;
}): React.JSX.Element {
  const [state, setState] = useState<State>({ kind: 'idle' });

  const load = async (): Promise<void> => {
    setState({ kind: 'loading' });
    const history = await loadArrivalHistory();
    setState(
      history
        ? { kind: 'ready', since: history.departuresSince ?? null, departures: usualDepartures(history, airport, Date.now()) }
        : { kind: 'unavailable' },
    );
  };

  const pick = (flight: UsualDeparture): void => {
    const gateTime = flight.usualAt - GATE_TO_TAKEOFF_MINUTES * 60_000;
    onPick({
      flightNumber: flight.flightNumber ?? flight.callsign,
      fillAt: gateTime,
      otherEndCountry: flight.toCountry,
      basis: 'usual-departure',
    });
    setState({
      kind: 'picked',
      title: [describe(flight.flightNumber ?? flight.callsign, flight.airline, null), flight.to ? `to ${flight.to}` : null]
        .filter(Boolean)
        .join(' '),
      detail: `Usually takes off around ${formatClock(flight.usualAt, airport.timeZone)} — seen on ${flight.daysSeen} of the last ${flight.daysConsidered} days. Filled in as ${formatClock(gateTime, airport.timeZone)}, allowing ${GATE_TO_TAKEOFF_MINUTES} minutes from the gate to take-off.`,
    });
  };

  if (state.kind === 'idle') {
    return (
      <button type="button" className={styles.entry} onClick={() => void load()}>
        <span className={styles.entryGlyph} aria-hidden="true">
          ✈
        </span>
        <span className={styles.entryText}>
          <span className={styles.entryTitle}>Dropping off for a flight leaving soon?</span>
          <span className={styles.entryBody}>
            Choose it from flights that usually leave {airport.name} in the next twelve hours, and
            the flight and time are filled in for you.
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
        <p className={ui.hint}>Checking SetoffIQ's record of departures…</p>
      </div>
    );
  }

  if (state.kind === 'unavailable') {
    return (
      <div className={styles.wrapper}>
        <p className={ui.hint}>SetoffIQ's record of departures could not be loaded just now.</p>
      </div>
    );
  }

  const now = Date.now();
  return (
    <div className={styles.wrapper}>
      <h2 className={styles.sectionTitle}>Usually leaving in the next twelve hours</h2>
      {state.departures.length === 0 ? (
        <p className={ui.hint}>
          {state.since
            ? `SetoffIQ has been recording departures since ${formatDate(Date.parse(`${state.since}T12:00:00Z`), airport.timeZone)}.`
            : 'SetoffIQ has only just started recording departures.'}{' '}
          A flight appears here once it has been seen taking off on at least {USUAL_MIN_DAYS} of the
          last seven days. Until then, enter the time from the booking below.
        </p>
      ) : (
        <>
          <p className={ui.hint}>
            Flights SetoffIQ has seen take off at about the same time on most recent days. A pattern
            it recorded, not a schedule: it cannot see delays or cancellations, and the time shown is
            take-off, not the gate time on a booking. Check with the airline.
          </p>
          <ul className={styles.list}>
            {state.departures.map((flight) => (
              <li key={flight.callsign}>
                <button type="button" className={styles.option} onClick={() => pick(flight)}>
                  <span className={styles.identifier}>{flight.flightNumber ?? flight.callsign}</span>
                  <span className={styles.who}>
                    {flight.airline ? <span className={styles.airline}>{flight.airline}</span> : null}
                    {flight.to ? <span className={styles.origin}>to {flight.to}</span> : null}
                    {flight.status === 'not-seen-yet' ? (
                      <span className={styles.notice}>
                        Not seen leaving yet — late, cancelled or not flying today
                      </span>
                    ) : null}
                    <span className={styles.callsign}>
                      {flight.daysSeen} of {flight.daysConsidered} days
                    </span>
                  </span>
                  <span className={styles.detail}>
                    {formatDate(flight.usualAt, airport.timeZone) === formatDate(now, airport.timeZone)
                      ? 'takes off'
                      : 'tomorrow'}
                  </span>
                  <span className={styles.detail}>~{formatClock(flight.usualAt, airport.timeZone)}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
