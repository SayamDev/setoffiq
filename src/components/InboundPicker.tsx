import { useState } from 'react';
import { formatAge, formatClock } from '../domain/time';
import type { AirportProfile } from '../domain/types';
import { listInboundAircraft, SnapshotTooOldError, type InboundAircraft } from '../services/flight';
import { Button, ui } from './ui';
import styles from './InboundPicker.module.css';

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; aircraft: InboundAircraft[] }
  | { kind: 'picked'; aircraft: InboundAircraft }
  | { kind: 'error' }
  | { kind: 'too-old'; ageMinutes: number };

/**
 * Pick from aircraft currently in the air near the airport.
 *
 * The quickest way to plan a pickup that is happening now: choosing an
 * aircraft fills in the flight number and, from its position, the date and
 * time — so nobody has to dig out a booking for a flight they can already see
 * on the list. It can only offer what is already flying; there is no free
 * source for "which flights land tomorrow", and the interface says so.
 */
export function InboundPicker({
  airport,
  onPick,
}: {
  airport: AirportProfile;
  onPick: (aircraft: InboundAircraft) => void;
}): React.JSX.Element {
  const [state, setState] = useState<State>({ kind: 'idle' });

  const load = async (): Promise<void> => {
    setState({ kind: 'loading' });
    try {
      setState({ kind: 'ready', aircraft: await listInboundAircraft(airport) });
    } catch (error) {
      setState(
        error instanceof SnapshotTooOldError
          ? { kind: 'too-old', ageMinutes: error.ageMinutes }
          : { kind: 'error' },
      );
    }
  };

  const pick = (aircraft: InboundAircraft): void => {
    onPick(aircraft);
    setState({ kind: 'picked', aircraft });
  };

  if (state.kind === 'idle') {
    return (
      <button type="button" className={styles.entry} onClick={() => void load()}>
        <span className={styles.entryGlyph} aria-hidden="true">
          ✈
        </span>
        <span className={styles.entryText}>
          <span className={styles.entryTitle}>Collecting from a flight that's in the air?</span>
          <span className={styles.entryBody}>
            Choose it from the aircraft heading for {airport.name} now, and the flight and time are
            filled in for you.
          </span>
        </span>
      </button>
    );
  }

  if (state.kind === 'picked') {
    const { aircraft } = state;
    return (
      <div className={styles.picked} role="status">
        <p className={styles.pickedTitle}>
          <span className={styles.identifier}>{aircraft.flightNumber ?? aircraft.callsign}</span>
          {aircraft.airline ? <span> · {aircraft.airline}</span> : null}
          {aircraft.from ? <span> from {aircraft.from}</span> : null}
        </p>
        <p className={ui.hint}>
          {aircraft.estimatedArrival
            ? `Due on stand about ${formatClock(aircraft.estimatedArrival, airport.timeZone)}, from its position now.`
            : 'The flight number is filled in. Enter the time from the booking below.'}
        </p>
        <Button variant="quiet" onClick={() => void load()} className={styles.change}>
          Choose a different aircraft
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      {state.kind === 'loading' ? <p className={ui.hint}>Checking what is in the air…</p> : null}

      {state.kind === 'too-old' ? (
        <p className={ui.hint}>
          {Number.isFinite(state.ageMinutes)
            ? `The latest flight data is ${formatAge(state.ageMinutes)} old, so it cannot show what is in the air now.`
            : 'The latest flight data has no timestamp, so it cannot show what is in the air now.'}{' '}
          Enter the flight details below instead.
        </p>
      ) : null}

      {state.kind === 'error' ? (
        <p className={ui.hint}>
          We couldn't check what is inbound just now. Enter the flight details below instead.
        </p>
      ) : null}

      {state.kind === 'ready' && state.aircraft.length === 0 ? (
        <p className={ui.hint}>
          No airline aircraft are heading for {airport.name} at the moment. This only ever shows
          flights already in the air, so enter the flight details below instead.
        </p>
      ) : null}

      {state.kind === 'ready' && state.aircraft.length > 0 ? (
        <>
          <p className={ui.hint}>
            Aircraft heading for {airport.name} now, nearest first. Where a route is shown it is the
            one reported for that callsign, not a schedule. Flights that have not taken off yet
            cannot appear here, and some airlines broadcast a callsign that is not the number on a
            ticket.
          </p>
          <ul className={styles.list}>
            {state.aircraft.map((aircraft) => (
              <li key={aircraft.callsign}>
                <button type="button" className={styles.option} onClick={() => pick(aircraft)}>
                  <span className={styles.identifier}>
                    {aircraft.flightNumber ?? aircraft.callsign}
                  </span>
                  <span className={styles.who}>
                    {aircraft.airline ? (
                      <span className={styles.airline}>{aircraft.airline}</span>
                    ) : null}
                    {aircraft.from ? (
                      <span className={styles.origin}>from {aircraft.from}</span>
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
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
