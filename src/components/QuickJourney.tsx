import { useEffect, useRef, useState } from 'react';
import { DEFAULT_AIRPORT } from '../domain/airports';
import { formatClock, formatDate, todayInZone } from '../domain/time';
import type { JourneyInput, JourneyKind } from '../domain/types';
import { validateScheduledTime } from '../domain/scheduleWindow';
import { bookingTime } from '../services/bookingTime';
import {
  loadSchedule,
  type ScheduledFlight,
} from '../services/flight/schedule';
import { normaliseFlightNumber } from '../services/flight/callsigns';
import { loadFlightRoute } from '../services/flight/route';
import { geocodePostcode, isValidPostcodeShape } from '../services/routing';
import { quickFlightMatches } from '../services/quickJourney';
import { openPicker } from './nativePicker';
import { Button, ui } from './ui';
import styles from './QuickJourney.module.css';

export function QuickJourney({
  kind,
  now,
  onSubmit,
}: {
  kind: JourneyKind;
  now: number;
  onSubmit(input: JourneyInput): void;
}): React.JSX.Element {
  const [number, setNumber] = useState('');
  const [date, setDate] = useState(() =>
    todayInZone(now, DEFAULT_AIRPORT.timeZone),
  );
  const [postcode, setPostcode] = useState('');
  const [clock, setClock] = useState('');
  const [needsTime, setNeedsTime] = useState(false);
  const [choices, setChoices] = useState<ScheduledFlight[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const clockRef = useRef<HTMLInputElement>(null);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  useEffect(() => {
    if (needsTime) clockRef.current?.focus();
  }, [needsTime]);
  const resetFlight = () => {
    setClock('');
    setNeedsTime(false);
    setChoices([]);
    setMessage('');
  };

  const calculate = async (selected?: ScheduledFlight) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setError('');
    setBusy(true);
    try {
      const flightNumber = normaliseFlightNumber(number);
      if (!/^[A-Z0-9]{2,3}\d{1,4}[A-Z]{0,2}$/.test(flightNumber)) {
        setError('Enter the flight number from the booking, such as EK21.');
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        setError('Choose the flight date at Manchester.');
        return;
      }
      if (!isValidPostcodeShape(postcode)) {
        setError('Enter a valid starting UK postcode, such as M1 4BT.');
        return;
      }
      let at: number;
      let match = selected;
      let observedAt: number | undefined;
      if (clock) {
        const parsed = bookingTime(
          kind,
          date,
          clock,
          DEFAULT_AIRPORT.timeZone,
          now,
        );
        if (typeof parsed === 'string') {
          setError(parsed);
          return;
        }
        at = parsed;
      } else {
        setMessage('Looking for your flight on the selected date…');
        const schedule = await loadSchedule(controller.signal);
        if (controller.signal.aborted) return;
        // Reuse the same bounded matcher for departures without mixing journey directions.
        const matches = quickFlightMatches(
          schedule,
          flightNumber,
          date,
          now,
          kind,
        );
        if (
          selected &&
          !matches.some(
            (item) =>
              item.scheduled === selected.scheduled &&
              item.flight === selected.flight,
          )
        ) {
          setChoices([]);
          setNeedsTime(true);
          setMessage(
            'That schedule record is no longer available. Enter the time from your booking.',
          );
          return;
        }
        if (!selected && matches.length > 1) {
          setChoices(matches);
          setMessage(
            'More than one flight time matches. Choose the one on your booking.',
          );
          return;
        }
        match = selected ?? matches[0];
        if (!match) {
          setNeedsTime(true);
          setMessage(
            'We could not confirm this flight time. Enter the Manchester time on your booking.',
          );
          return;
        }
        at = match.scheduled;
        observedAt = schedule ? Date.parse(schedule.generatedAt) : undefined;
        const problem = validateScheduledTime(kind, at, now);
        if (problem) {
          setNeedsTime(true);
          setMessage(problem.message);
          return;
        }
      }
      setMessage('Checking your postcode and flight details…');
      const [located, route] = await Promise.all([
        geocodePostcode(postcode, controller.signal),
        loadFlightRoute(kind, flightNumber, at, controller.signal).catch(
          () => null,
        ),
      ]);
      if (controller.signal.aborted) return;
      if (!located.value) {
        setError(
          located.message ??
            'We could not look up that postcode. Check it and try again.',
        );
        return;
      }
      const country = match?.otherEnd?.country ?? route?.country;
      const rawTerminal = match?.terminal ?? route?.terminal;
      const terminal = rawTerminal
        ? rawTerminal.startsWith('T')
          ? rawTerminal
          : `T${rawTerminal}`
        : null;
      onSubmit({
        kind,
        airportIata: DEFAULT_AIRPORT.iataCode,
        flightNumber,
        scheduledTime: at,
        scheduledTimeSource: clock ? 'booking' : 'dated-schedule',
        scheduledTimeObservedAt: observedAt,
        passengerRoute: country === 'GB' ? 'domestic' : 'international',
        terminalCode: DEFAULT_AIRPORT.terminals.some(
          (item) => item.code === terminal,
        )
          ? terminal
          : null,
        luggage: null,
        origin: located.value,
        pickupMode: kind === 'pickup' ? 'quick-pickup' : null,
        dropoffMode: kind === 'dropoff' ? 'drop-off' : null,
        scenarioId: null,
      });
    } catch {
      if (!controller.signal.aborted)
        setError(
          'We could not complete that check. Please try again, or use the full form.',
        );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };
  return (
    <form
      className={styles.form}
      aria-label="Quick journey planner"
      onSubmit={(event) => {
        event.preventDefault();
        void calculate();
      }}
    >
      <div className={styles.fields}>
        <label>
          Flight number
          <input
            className={ui.control}
            name="flight"
            value={number}
            onChange={(event) => {
              setNumber(event.target.value);
              resetFlight();
            }}
            placeholder="e.g. EK21"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            disabled={busy}
            required
          />
        </label>
        <label>
          Flight date at Manchester
          <input
            className={ui.control}
            type="date"
            name="flight-date"
            value={date}
            onChange={(event) => {
              setDate(event.target.value);
              resetFlight();
            }}
            onClick={openPicker}
            disabled={busy}
            required
          />
        </label>
        <label className={styles.postcode}>
          Starting postcode
          <input
            className={ui.control}
            name="postcode"
            value={postcode}
            onChange={(event) => setPostcode(event.target.value)}
            placeholder="e.g. M1 4BT"
            autoComplete="postal-code"
            disabled={busy}
            required
          />
        </label>
      </div>
      <p className={ui.hint}>
        We’ll look for the flight time, route and terminal. Your postcode is
        used to calculate the drive.
      </p>
      <p role="status">{message}</p>
      {choices.length ? (
        <fieldset className={styles.choices}>
          <legend>Which time is on your booking?</legend>
          {choices.map((choice) => (
            <Button
              key={choice.scheduled}
              variant="secondary"
              disabled={busy}
              onClick={() => void calculate(choice)}
            >
              {choice.flight} ·{' '}
              {formatClock(choice.scheduled, DEFAULT_AIRPORT.timeZone)} ·{' '}
              {formatDate(choice.scheduled, DEFAULT_AIRPORT.timeZone)}
            </Button>
          ))}
        </fieldset>
      ) : null}
      {needsTime ? (
        <label>
          {kind === 'pickup'
            ? 'Booking arrival time at Manchester'
            : 'Booking departure time at Manchester'}
          <input
            ref={clockRef}
            className={ui.control}
            type="time"
            name="booking-time"
            value={clock}
            onChange={(event) => setClock(event.target.value)}
            onClick={openPicker}
            disabled={busy}
            required
          />
        </label>
      ) : null}
      {!needsTime ? (
        <details>
          <summary>I already have the booking time</summary>
          {!needsTime ? (
            <label>
              Manchester time on your booking
              <input
                className={ui.control}
                type="time"
                name="optional-booking-time"
                value={clock}
                onChange={(event) => setClock(event.target.value)}
                onClick={openPicker}
                disabled={busy}
              />
            </label>
          ) : null}
          <p className={ui.hint}>
            A booking time you enter always takes priority over a schedule
            lookup.
          </p>
        </details>
      ) : null}
      {error ? (
        <p ref={errorRef} role="alert" tabIndex={-1}>
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={busy}>
        {busy
          ? 'Checking your journey…'
          : needsTime
            ? 'Use booking time and calculate'
            : 'Find when to leave'}
      </Button>
      <p className={ui.hint}>
        {kind === 'pickup'
          ? 'Quick pickup, with an allowance for bags. International-arrival allowance unless the route is known to be domestic.'
          : 'Terminal drop-off, with airport check-in allowances.'}{' '}
        You can change these details with your result.
      </p>
    </form>
  );
}
