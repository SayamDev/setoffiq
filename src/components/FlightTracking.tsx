import { useState } from 'react';
import type { FlightStatus, Observed, SavedJourney } from '../domain/types';
import { formatClock, formatDate, formatRelative } from '../domain/time';
import { DEFAULT_AIRPORT } from '../domain/airports';
import { validatedTrackingCallsign } from '../services/flight/callsigns';
import { appendEvent } from '../storage/journeys';
import { Button, ui } from './ui';
import styles from './FlightTracking.module.css';

/** Present source times without computing a prediction or inventing flight progress. */
export function FlightTracking({ journey, flight, now, onSave, checking = false }: {
  journey: SavedJourney; flight: Observed<FlightStatus> | null; now: number; onSave(journey: SavedJourney): void; checking?: boolean;
}): React.JSX.Element {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const zone = DEFAULT_AIRPORT.timeZone;
  const status = flight?.value;
  const estimated = status?.estimatedArrivalSource === 'live-position' || status?.estimatedArrivalSource === 'airline-schedule' || status?.estimatedArrivalSource === 'scenario';
  const observation = status?.observedAt;
  const save = (callsign: string | undefined) => {
    onSave(appendEvent({ ...journey, input: { ...journey.input, trackingCallsign: callsign }, lastCheckedAt: null }, 'flight-updated', callsign ? `You linked aircraft callsign ${callsign} to ${journey.input.flightNumber ?? 'this journey'} for ${formatDate(journey.input.scheduledTime, zone)}.` : 'You removed the linked aircraft callsign.', now));
    setEditing(false);
  };
  return <section className={styles.section} aria-labelledby="flight-timing-heading">
    <h3 id="flight-timing-heading">Arrival updates</h3>
    <dl className={styles.times}>
      <div><dt>{journey.input.scheduledTimeSource === 'dated-schedule' ? 'Published scheduled arrival' : 'Booking arrival'}</dt><dd>{formatClock(journey.input.scheduledTime, zone)}</dd></div>
      <div><dt>{status?.estimatedArrivalSource === 'live-position' ? 'Estimated at stand · includes taxi' : 'Latest arrival estimate'}</dt><dd>{estimated && status?.estimatedArrival != null ? <>{formatClock(status.estimatedArrival, zone)}<span className={styles.estimateDate}>{formatDate(status.estimatedArrival, zone)}</span></> : 'Awaiting flight data'}</dd></div>
    </dl>
    <p className={ui.hint}>Manchester local time · {formatDate(journey.input.scheduledTime, zone)}. The planned flight time stays unchanged when an estimate updates.</p>
    <p role="status">{!flight ? (checking ? 'Checking the latest shared snapshot…' : 'Flight data unavailable. Your saved flight time remains the fallback.') : estimated
      ? `${status?.estimatedArrivalSource === 'live-position' ? 'Calculated from the aircraft position' : status?.estimatedArrivalSource === 'scenario' ? 'Test scenario — simulated data' : 'Reported by the airline schedule'}${observation != null ? ` · observed ${formatClock(observation, zone)} (${formatRelative(observation, now)})` : ''}.${flight.state === 'stale' ? ' This observation is old; confidence is reduced.' : ''}`
      : 'No usable aircraft estimate yet. Planning from the saved flight time; not seeing an aircraft does not mean it has not taken off.'}</p>
    {status?.callsign ? <p>Observed callsign: <strong>{status.callsign}</strong></p> : null}
    {journey.input.trackingCallsign ? <p>Linked by you: <strong>{journey.input.trackingCallsign}</strong> for this journey.</p> : null}
    <details className={styles.limits}><summary>How often this updates and what it can see</summary><p className={ui.hint}>Shared positions usually refresh about every 15 minutes, with possible delays. Coverage is roughly 460 km around Manchester. Updates can move earlier or later; holding and runway changes are not known.</p></details>
    <div className={styles.actions}><Button variant="secondary" onClick={() => { setValue(journey.input.trackingCallsign ?? ''); setError(''); setEditing(!editing); }}>{journey.input.trackingCallsign ? 'Change aircraft callsign' : 'Link aircraft callsign'}</Button>
    {journey.input.trackingCallsign ? <Button variant="secondary" onClick={() => save(undefined)}>Remove callsign link</Button> : null}</div>
    {editing ? <form className={styles.form} onSubmit={event => {
      event.preventDefault(); const callsign = validatedTrackingCallsign(value);
      if (!callsign) { setError('Enter a broadcast callsign: 3 letters followed by 1–5 letters or numbers, such as RUK87AL.'); return; }
      save(callsign);
    }}>
      <label>Aircraft callsign for {journey.input.flightNumber ?? 'this flight'} on {formatDate(journey.input.scheduledTime, zone)}<input className={ui.control} value={value} onChange={event => setValue(event.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={10} required /></label>
      <p className={ui.hint}>Only link a callsign you have verified belongs to this flight on this date. Airlines can use a different callsign each day. This link is saved only with this browser’s journey; it cannot extend tracking coverage.</p>
      {error ? <p role="alert">{error}</p> : null}
      <div className={styles.actions}><Button type="submit">Link this aircraft</Button><Button variant="secondary" onClick={() => setEditing(false)}>Cancel</Button></div>
    </form> : null}
  </section>;
}
