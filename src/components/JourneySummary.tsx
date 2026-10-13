import { useEffect, useRef, useState } from 'react';
import type { VoiceDraft } from '../services/voice/journey';
import type { VoicePatch } from '../services/voice/parser';
import { normaliseFlightNumber } from '../services/flight/callsigns';
import { Button, ui } from './ui';
import styles from './VoiceJourney.module.css';

type Field =
  | 'kind'
  | 'date'
  | 'time'
  | 'flightNumber'
  | 'airline'
  | 'place'
  | 'postcode';
function displayDate(date: string): string {
  const instant = new Date(`${date}T12:00:00Z`);
  return Number.isFinite(instant.getTime())
    ? new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(instant)
    : 'Needed';
}
export function JourneySummary({
  draft,
  onApply,
  onBeginEdit,
}: {
  draft: VoiceDraft;
  onApply(patch: VoicePatch): void;
  onBeginEdit?(): void;
}): React.JSX.Element {
  const [field, setField] = useState<Field | null>(null);
  const [value, setValue] = useState('');
  const control = useRef<HTMLInputElement | HTMLSelectElement | null>(null);
  const launcher = useRef<HTMLButtonElement | null>(null);
  const labels: Record<Field, string> = {
    kind: 'Journey type',
    date: 'Flight date',
    time: draft.kind === 'pickup' ? 'Landing time' : 'Departure time',
    flightNumber: 'Flight number',
    airline: 'Airline',
    place: draft.kind === 'pickup' ? 'Flying from' : 'Flying to',
    postcode: 'Starting postcode',
  };
  useEffect(() => {
    if (field) control.current?.focus();
  }, [field]);
  const close = () => {
    setField(null);
    launcher.current?.focus();
  };
  const fields: Field[] = [
    'kind',
    'date',
    'time',
    'postcode',
    ...(['flightNumber', 'airline', 'place'] as const).filter((key) =>
      Boolean(draft[key]),
    ),
  ];
  return (
    <section
      className={styles.journeySummary}
      aria-labelledby="journey-summary-title"
    >
      <h2 id="journey-summary-title">Your journey details</h2>
      <p className={ui.hint}>
        Tap a detail to change it. Times are in Manchester time.
      </p>
      <div className={styles.summaryItems}>
        {fields.map((key) => (
          <button
            type="button"
            key={key}
            aria-label={`Edit ${labels[key].toLowerCase()}: ${draft[key] || 'needed'}`}
            onClick={(event) => {
              onBeginEdit?.();
              launcher.current = event.currentTarget;
              setValue(draft[key] ?? '');
              setField(key);
            }}
          >
            <span>{labels[key]}</span>
            <strong>
              {key === 'kind'
                ? draft.kind === 'pickup'
                  ? 'Pickup'
                  : 'Drop-off'
                : key === 'date'
                  ? displayDate(draft.date)
                  : draft[key] || 'Needed'}
            </strong>
            <span className={styles.editLabel}>Edit</span>
          </button>
        ))}
      </div>
      {field ? (
        <form
          className={styles.summaryEditor}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              close();
            }
          }}
          onSubmit={(event) => {
            event.preventDefault();
            const patch: VoicePatch =
              field === 'kind'
                ? { kind: value === 'dropoff' ? 'dropoff' : 'pickup' }
                : {
                    [field]:
                      (field === 'flightNumber'
                        ? normaliseFlightNumber(value)
                        : value.trim()) || undefined,
                  };
            onApply(patch);
            close();
          }}
        >
          <label htmlFor="journey-detail-editor">
            New {labels[field].toLowerCase()}
          </label>
          {field === 'kind' ? (
            <select
              id="journey-detail-editor"
              className={ui.control}
              ref={(node) => {
                control.current = node;
              }}
              value={value}
              onChange={(event) => setValue(event.target.value)}
            >
              <option value="pickup">Pickup</option>
              <option value="dropoff">Drop-off</option>
            </select>
          ) : (
            <input
              id="journey-detail-editor"
              className={ui.control}
              ref={(node) => {
                control.current = node;
              }}
              type={
                field === 'date' ? 'date' : field === 'time' ? 'time' : 'text'
              }
              value={value}
              onChange={(event) => setValue(event.target.value)}
              required={['date', 'time', 'postcode'].includes(field)}
              maxLength={100}
              autoComplete={field === 'postcode' ? 'postal-code' : 'off'}
            />
          )}
          <div className={styles.actions}>
            <Button type="submit">Apply change</Button>
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
