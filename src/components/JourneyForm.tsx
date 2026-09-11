import { useId, useRef, useState } from 'react';
import { DEFAULT_AIRPORT } from '../domain/airports';
import { formatClock, parseLocalDateTime, todayInZone } from '../domain/time';
import { earliestSelectableDate, validateScheduledTime } from '../domain/scheduleWindow';
import type {
  AirportProfile,
  DropoffMode,
  JourneyInput,
  JourneyKind,
  PassengerRoute,
  PickupMode,
} from '../domain/types';
import { geocodePostcode, isValidPostcodeShape } from '../services/routing';
import { normaliseFlightNumber, type InboundAircraft } from '../services/flight';
import { Button, Field, ui } from './ui';
import { InboundPicker } from './InboundPicker';
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
  /** Whether the date and time came from a picked aircraft rather than a booking. */
  const [whenFromAircraft, setWhenFromAircraft] = useState(false);
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
   * Picking an aircraft that is already in the air gives everything the time
   * field was for: the flight number, and an arrival from its position. The
   * route's origin settles domestic or international where it is known.
   */
  const fillFromAircraft = (aircraft: InboundAircraft): void => {
    update('flightNumber', aircraft.flightNumber ?? aircraft.callsign);
    if (aircraft.estimatedArrival !== null) {
      update('date', todayInZone(aircraft.estimatedArrival, airport.timeZone));
      update('time', formatClock(aircraft.estimatedArrival, airport.timeZone));
      setWhenFromAircraft(true);
    }
    if (aircraft.fromCountry) {
      update('passengerRoute', aircraft.fromCountry === 'GB' ? 'domestic' : 'international');
    }
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
                <li key={key}>{message}</li>
              ))}
            </ul>
          </>
        ) : null}
      </div>

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
        SetoffIQ covers Manchester Airport for now. More airports can be added without changing how
        the recommendation works.
      </p>

      {kind === 'pickup' ? <InboundPicker airport={airport} onPick={fillFromAircraft} /> : null}

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
                setWhenFromAircraft(false);
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
                update('time', event.target.value);
                setWhenFromAircraft(false);
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
          {whenFromAircraft
            ? "Filled in from the aircraft's position. Change them if the booking says otherwise."
            : 'The date and time on your booking.'}
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
          Nothing you type here leaves your device except the postcode, which is sent to a UK
          postcode lookup to turn it into a location.
        </p>
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
