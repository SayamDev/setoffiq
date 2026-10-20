import { useRef, useState } from 'react';
import type { SavedJourney } from '../domain/types';
import { DEFAULT_AIRPORT } from '../domain/airports';
import { formatClock, formatDate, todayInZone } from '../domain/time';
import { bookingTime } from '../services/bookingTime';
import { correctBookingTime } from '../storage/journeys';
import { Button, ui } from './ui';
import styles from './BookingTimeEditor.module.css';

export function BookingTimeEditor({ journey, onSave }: { journey: SavedJourney; onSave(journey: SavedJourney): void }): React.JSX.Element {
  const zone = DEFAULT_AIRPORT.timeZone;
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState('');
  const [clock, setClock] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const trigger = useRef<HTMLButtonElement>(null);
  const label = journey.input.kind === 'pickup' ? 'Flight arrival at Manchester' : 'Flight departure from Manchester';
  const abbreviation = new Intl.DateTimeFormat('en-GB', { timeZone: zone, timeZoneName: 'short' }).formatToParts(journey.input.scheduledTime).find(part => part.type === 'timeZoneName')?.value;
  const close = () => { setOpen(false); trigger.current?.focus(); };
  return (
    <section className={styles.section} aria-labelledby="saved-flight-time">
      <div className={styles.row}>
        <div>
          <h2 id="saved-flight-time">{label}</h2>
          <p className={styles.clock}><strong>{formatClock(journey.input.scheduledTime, zone)}</strong> <span>{formatDate(journey.input.scheduledTime, zone)} · Manchester local time ({abbreviation})</span></p>
        </div>
        <Button variant="secondary" onClick={event => {
          trigger.current = event.currentTarget;
          setDate(todayInZone(journey.input.scheduledTime, zone)); setClock(formatClock(journey.input.scheduledTime, zone)); setError(''); setOpen(true);
        }}>Correct flight time</Button>
      </div>
      <p className={ui.hint}>This is the saved flight time, separate from when you should set off. If your airline booking differs, use its time. Refreshing the plan does not verify your booking.</p>
      {open ? <form className={styles.editor} onSubmit={event => {
        event.preventDefault();
        const at = bookingTime(journey.input.kind, date, clock, zone, Date.now());
        if (typeof at === 'string') { setError(at); return; }
        onSave(correctBookingTime(journey, at, zone));
        setMessage(`Flight time saved as ${clock}, Manchester time.${at === journey.input.scheduledTime ? '' : ' Recalculating your plan.'}`); close();
      }} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); close(); } }}>
        <p>Copy the {journey.input.kind === 'pickup' ? 'Manchester arrival' : 'Manchester departure'} time exactly as shown on your airline booking. Do not convert it to UTC.</p>
        <div className={styles.fields}>
          <label>Flight date<input className={ui.control} type="date" name="flight-date" autoComplete="off" value={date} onChange={event => setDate(event.target.value)} required /></label>
          <label>Booking time at Manchester<input className={ui.control} type="time" name="flight-time" autoComplete="off" value={clock} onChange={event => setClock(event.target.value)} required autoFocus /></label>
        </div>
        {error ? <p role="alert" className={ui.hint}>{error}</p> : null}
        <div className={styles.row}><Button type="submit">Use booking time</Button><Button variant="secondary" onClick={close}>Cancel</Button></div>
      </form> : null}
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
