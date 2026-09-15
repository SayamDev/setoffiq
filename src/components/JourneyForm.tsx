import { useId, useRef, useState } from 'react';
import { DEFAULT_AIRPORT } from '../domain/airports';
import { formatClock, formatDate, parseLocalDateTime, todayInZone } from '../domain/time';
import { earliestSelectableDate, impliedDate, validateScheduledTime } from '../domain/scheduleWindow';
import type {
  AirportProfile,
  DropoffMode,
  JourneyInput,
  JourneyKind,
  PassengerRoute,
  PickupMode,
} from '../domain/types';
import { geocodePostcode, isValidPostcodeShape } from '../services/routing';
import { normaliseFlightNumber } from '../services/flight';
import { Button, Field, ui } from './ui';
import { DeparturePicker } from './DeparturePicker';
import { InboundPicker, type PickedFlight } from './InboundPicker';
import { GATE_TO_TAKEOFF_MINUTES } from '../domain/assumptions';
import styles from './JourneyForm.module.css';

interface FormState {
  flightNumber: string;
  date: string;
  time: string;
  passengerRoute: PassengerRoute;
  terminalCode: string;
  postcode: string;
  mode: string;
}

type Errors = Partial<Record<keyof FormState | 'form', string>>;

const PICKUP_DEFAULT: PickupMode = 'quick-pickup';
const DROPOFF_DEFAULT: DropoffMode = 'drop-off';

export function JourneyForm({
  kind,
  airport = DEFAULT_AIRPORT,
  now,
  onSubmit,
}: {
  kind: JourneyKind;
  airport?: AirportProfile;
  now: number;
  onSubmit: (input: JourneyInput) => void;
}): React.JSX.Element {
  const baseId = useId();
  const errorRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  /** Where the date and time came from, when not typed from a booking. */
  const [whenFrom, setWhenFrom] = useState<PickedFlight['basis'] | null>(null);
  /** Whether someone chose the date, rather than leaving the default. */
  const [dateChosen, setDateChosen] = useState(false);
  /** Whether a time already past today was taken to mean tomorrow. */
  const [takenAsTomorrow, setTakenAsTomorrow] = useState(false);
  const [state, setState] = useState<FormState>({
    flightNumber: '',
    date: todayInZone(now, airport.timeZone),
    time: '',
    passengerRoute: 'international',
    terminalCode: '',
    postcode: '',
    mode: kind === 'pickup' ? PICKUP_DEFAULT : DROPOFF_DEFAULT,
  });

  const update = <K extends keyof FormState>(key: K, value: FormState[K]): void => {
    setState((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined, form: undefined }));
  };

  /*
   * A picked flight gives everything the time field was for: the flight
   * number, and an arrival — from a live position, or from when it usually
   * lands. The route's origin settles domestic or international where known.
   */
  const fillFromPick = (flight: PickedFlight): void => {
    update('flightNumber', flight.flightNumber);
    if (flight.fillAt !== null) {
      update('date', todayInZone(flight.fillAt, airport.timeZone));
      update('time', formatClock(flight.fillAt, airport.timeZone));
      setWhenFrom(flight.basis);
      setDateChosen(true);
      setTakenAsTomorrow(false);
    }
    if (flight.otherEndCountry) {
      update('passengerRoute', flight.otherEndCountry === 'GB' ? 'domestic' : 'international');
    }
  };

  /** The line under the date and time: where they came from. */
  const whenNote = (): string => {
    switch (whenFrom) {
      case 'position':
        return "Filled in from the aircraft's position. Change them if the booking says otherwise.";
      case 'schedule':
        return 'Filled in from the airline schedule. Check the time on the booking.';
      case 'timetable':
        return "Filled in from the airlines' published timetable, which carries no status. Check the time on the booking.";
      case 'usual':
        return 'Filled in from when this flight usually lands. Check the time on the booking.';
      case 'usual-departure':
        return `Filled in from when this flight usually takes off, less ${GATE_TO_TAKEOFF_MINUTES} minutes from the gate. Check the time on the booking.`;
      default:
        break;
    }
    if (takenAsTomorrow) {
      const when = parseLocalDateTime(state.date, state.time, airport.timeZone) ?? now;
      return `Taken as tomorrow, ${formatDate(when, airport.timeZone)}, because ${state.time} today has already passed. Change the date if you meant another day.`;
    }
    return 'The date and time on your booking.';
  };

  const timeLabel = kind === 'pickup' ? 'Scheduled arrival time' : 'Scheduled departure time';
  const options = kind === 'pickup' ? airport.pickupOptions : airport.dropoffOptions;

  const validate = (): Errors => {
    const next: Errors = {};
    if (!state.date) next.date = 'Choose the date of the flight.';
    if (!state.time) next.time = `Enter the ${kind === 'pickup' ? 'arrival' : 'departure'} time from the booking.`;
    if (state.date && state.time) {
      const scheduledTime = parseLocalDateTime(state.date, state.time, airport.timeZone);
      if (scheduledTime === null) {
        next.time = 'That date and time could not be read.';
      } else {
        const problem = validateScheduledTime(kind, scheduledTime, now);
        if (problem) next.time = problem.message;
      }
    }
    if (!state.postcode.trim()) {
      next.postcode = 'Enter the UK postcode you are setting off from.';
    } else if (!isValidPostcodeShape(state.postcode)) {
      next.postcode = "That doesn't look like a UK postcode. Try something like M1 4BT.";
    }
    return next;
  };

  const handleSubmit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    const found = validate();
    if (Object.keys(found).length > 0) {
      setErrors(found);
      errorRef.current?.focus();
      return;
    }

    setBusy(true);
    setErrors({});
    try {
      const located = await geocodePostcode(state.postcode);
      if (!located.value) {
        setErrors({ postcode: located.message ?? "We couldn't look up that postcode." });
        errorRef.current?.focus();
        return;
      }

      const scheduledTime = parseLocalDateTime(state.date, state.time, airport.timeZone)!;
      onSubmit({
        kind,
        airportIata: airport.iataCode,
        flightNumber: state.flightNumber.trim() ? normaliseFlightNumber(state.flightNumber) : null,
        scheduledTime,
        passengerRoute: state.passengerRoute,
        terminalCode: state.terminalCode || null,
        origin: located.value,
        pickupMode: kind === 'pickup' ? (state.mode as PickupMode) : null,
        dropoffMode: kind === 'dropoff' ? (state.mode as DropoffMode) : null,
        scenarioId: null,
      });
    } finally {
      setBusy(false);
    }
  };

  const errorList = Object.entries(errors).filter(([, message]) => Boolean(message));

  const focusErrorField = (key: string): void => {
    const fieldIds: Partial<Record<keyof FormState, string>> = {
      date: `${baseId}-date`,
      time: `${baseId}-time`,
      postcode: `${baseId}-postcode`,
    };
    const targetId = fieldIds[key as keyof FormState];
    const target = targetId ? document.getElementById(targetId) : null;
    if (!target) return;

    target.focus({ preventScroll: true });
    target.scrollIntoView?.({
      behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'center',
    });
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <div
        ref={errorRef}
        tabIndex={-1}
        aria-live="assertive"
        className={errorList.length ? styles.errorSummary : undefined}
      >
        {errorList.length ? (
          <>
            <strong>Check these before calculating:</strong>
            <ul>
              {errorList.map(([key, message]) => (
                <li key={key}>
                  {key === 'form' ? (
                    message
                  ) : (
                    <button
                      className={styles.errorLink}
                      type="button"
                      onClick={() => focusErrorField(key)}
                    >
                      {message}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>

      <div className={styles.workspace}>
        <section className={styles.flightPanel} aria-labelledby={`${baseId}-flight-step`}>
          <header className={styles.sectionHeader}>
            <span className={styles.step}>01</span>
            <div>
              <h2 className={styles.sectionTitle} id={`${baseId}-flight-step`}>
                Choose the flight
              </h2>
              <p className={styles.sectionCopy}>
                Pick from current flights or use the booking details.
              </p>
            </div>
          </header>

          <Field id={`${baseId}-airport`} label="Airport">
            <select
              id={`${baseId}-airport`}
              className={ui.control}
              value={airport.iataCode}
              disabled
              aria-describedby={`${baseId}-airport-note`}
            >
              <option value={airport.iataCode}>
                {airport.name} ({airport.iataCode})
              </option>
            </select>
          </Field>
          <p className={ui.hint} id={`${baseId}-airport-note`}>
            Manchester Airport is currently supported.
          </p>

          {kind === 'pickup' ? (
            <InboundPicker airport={airport} onPick={fillFromPick} />
          ) : (
            <DeparturePicker airport={airport} onPick={fillFromPick} />
          )}
        </section>

        <section className={styles.detailsPanel} aria-labelledby={`${baseId}-details-step`}>
          <header className={styles.sectionHeader}>
            <span className={styles.step}>02</span>
            <div>
              <h2 className={styles.sectionTitle} id={`${baseId}-details-step`}>
                Journey details
              </h2>
              <p className={styles.sectionCopy}>Confirm the booking and where you are leaving from.</p>
            </div>
          </header>

          <div className={ui.stackTight}>
        <div className={styles.grid}>
          <Field
            id={`${baseId}-date`}
            label="Date"
            error={errors.date ?? null}
          >
            <input
              id={`${baseId}-date`}
              className={errors.date ? ui.controlInvalid : ui.control}
              type="date"
              value={state.date}
              min={earliestSelectableDate(kind, now, airport.timeZone)}
              onChange={(event) => {
                update('date', event.target.value);
                setWhenFrom(null);
                setDateChosen(true);
                setTakenAsTomorrow(false);
              }}
              onClick={openPicker}
              aria-describedby={`${baseId}-when-note`}
              required
            />
          </Field>

          <Field id={`${baseId}-time`} label={timeLabel} error={errors.time ?? null}>
            <input
              id={`${baseId}-time`}
              className={errors.time ? ui.controlInvalid : ui.control}
              type="time"
              value={state.time}
              onChange={(event) => {
                const time = event.target.value;
                update('time', time);
                setWhenFrom(null);
                // A time already gone today, with the date left at its default,
                // almost always means tomorrow: 01:05 typed at 19:00.
                if (!dateChosen) {
                  const implied = impliedDate(kind, time, now, airport.timeZone);
                  update('date', implied.date);
                  setTakenAsTomorrow(implied.tomorrow);
                }
              }}
              onClick={openPicker}
              aria-describedby={`${baseId}-when-note`}
              required
            />
          </Field>
        </div>
        {/* One note for the pair, below it: a hint inside only the time field
            pushed that box lower than the date box beside it. */}
        <p className={ui.hint} id={`${baseId}-when-note`}>
          {whenNote()}
        </p>
          </div>

      <Field
        id={`${baseId}-flight`}
        label="Flight number (optional)"
        hint={
          kind === 'pickup'
            ? "Lets SetoffIQ track the aircraft once it's in the air. Leave blank to use the scheduled time."
            : // Nothing is looked up for a drop-off — the departure time on the
              // ticket is the whole input — so the field is labelled for what it
              // actually does rather than implying a lookup that never happens.
              'Only used to label this journey in your saved list. A drop-off is planned entirely from the departure time above.'
        }
      >
        <input
          id={`${baseId}-flight`}
          className={ui.control}
          type="text"
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="EK21"
          value={state.flightNumber}
          onChange={(event) => update('flightNumber', event.target.value)}
        />
      </Field>

      <Field
        id={`${baseId}-postcode`}
        label="Setting off from"
        hint="Your UK postcode, e.g. M1 4BT."
        error={errors.postcode ?? null}
      >
        <input
          id={`${baseId}-postcode`}
          className={errors.postcode ? ui.controlInvalid : ui.control}
          type="text"
          inputMode="text"
          autoComplete="postal-code"
          spellCheck={false}
          placeholder="M1 4BT"
          value={state.postcode}
          onChange={(event) => update('postcode', event.target.value)}
          required
        />
      </Field>

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>
          {kind === 'pickup' ? 'Where is the flight arriving from?' : 'Where is the flight going?'}
        </legend>
        <div className={styles.inline}>
          {(['domestic', 'international'] as PassengerRoute[]).map((route) => (
            <label
              key={route}
              className={state.passengerRoute === route ? styles.inlineOptionSelected : styles.inlineOption}
            >
              <input
                className={styles.optionInput}
                type="radio"
                name={`${baseId}-route`}
                value={route}
                checked={state.passengerRoute === route}
                onChange={() => update('passengerRoute', route)}
              />
              <span className={styles.optionBody}>
                <span className={styles.optionLabel}>
                  {route === 'domestic' ? 'Within the UK' : 'International'}
                </span>
                <span className={styles.optionDescription}>
                  {route === 'domestic'
                    ? 'No border control on arrival'
                    : 'Border control adds time on arrival'}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <Field id={`${baseId}-terminal`} label="Terminal (optional)" hint="Confirm with your airline.">
        <select
          id={`${baseId}-terminal`}
          className={ui.control}
          value={state.terminalCode}
          onChange={(event) => update('terminalCode', event.target.value)}
        >
          <option value="">Not sure</option>
          {airport.terminals.map((terminal) => (
            <option key={terminal.code} value={terminal.code}>
              {terminal.name}
            </option>
          ))}
        </select>
      </Field>

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>
          {kind === 'pickup' ? 'How will you collect them?' : 'How will you drop them off?'}
        </legend>
        <div className={styles.options}>
          {options.map((option) => (
            <label
              key={option.id}
              className={state.mode === option.id ? styles.optionSelected : styles.option}
            >
              <input
                className={styles.optionInput}
                type="radio"
                name={`${baseId}-mode`}
                value={option.id}
                checked={state.mode === option.id}
                onChange={() => update('mode', option.id)}
              />
              <span className={styles.optionBody}>
                <span className={styles.optionLabel}>{option.label}</span>
                <span className={styles.optionDescription}>{option.description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

          <div className={styles.submitRow}>
            <Button type="submit" block disabled={busy}>
              {busy ? 'Checking your postcode…' : 'Calculate my journey'}
            </Button>
            <p className={ui.hint}>
              Only your postcode leaves this device, for location lookup.
            </p>
          </div>
        </section>
      </div>
    </form>
  );
}

/**
 * Open the browser's own date or time picker on a click anywhere in the box,
 * not only on its small icon. Keyboard entry is untouched; where a browser
 * refuses (no support, or not a user gesture), the box behaves as before.
 */
function openPicker(event: React.MouseEvent<HTMLInputElement>): void {
  try {
    event.currentTarget.showPicker?.();
  } catch {
    // Typing still works.
  }
}
