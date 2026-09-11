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
  | { kind: 'error' }
  | { kind: 'too-old'; ageMinutes: number };

/**
 * Pick from aircraft currently in the air near the airport.
 *
 * An assist for the flight-number field, not a schedule. There is no free
 * source for "which flights land tomorrow", so this can only offer what is
 * already flying — which is genuinely useful for a pickup in the next hour or
 * two and useless for anything further out. The interface says so rather than
 * letting someone discover it by finding their flight missing.
 */
export function InboundPicker({
  airport,
  onPick,
}: {
  airport: AirportProfile;
  onPick: (flightNumber: string) => void;
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

  if (state.kind === 'idle') {
    return (
      <div className={styles.wrapper}>
        <Button variant="quiet" onClick={load} className={styles.trigger}>
          Or pick from aircraft inbound now
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
          Type the flight number instead.
        </p>
      ) : null}

      {state.kind === 'error' ? (
        <p className={ui.hint}>
          We couldn't check what is inbound just now. Type the flight number instead.
        </p>
      ) : null}

      {state.kind === 'ready' && state.aircraft.length === 0 ? (
        <p className={ui.hint}>
          No airline aircraft are inbound to {airport.name} at the moment. This only ever shows
          flights already in the air, so type the flight number instead.
        </p>
      ) : null}

      {state.kind === 'ready' && state.aircraft.length > 0 ? (
        <>
          <p className={ui.hint}>
            Aircraft in the air near {airport.name} now. Flights that have not taken off yet cannot
            appear here, and some airlines broadcast a callsign that is not the number on a ticket.
          </p>
          <ul className={styles.list}>
            {state.aircraft.map((aircraft) => (
              <li key={aircraft.callsign}>
                <button
                  type="button"
                  className={styles.option}
                  onClick={() => onPick(aircraft.flightNumber ?? aircraft.callsign)}
                >
                  <span className={styles.identifier}>
                    {aircraft.flightNumber ?? aircraft.callsign}
                  </span>
                  <span className={styles.who}>
                    {aircraft.airline ? (
                      <span className={styles.airline}>{aircraft.airline}</span>
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
