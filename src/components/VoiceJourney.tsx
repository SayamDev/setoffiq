import { useEffect, useRef, useState } from 'react';
import { DEFAULT_AIRPORT } from '../domain/airports';
import { formatClock, parseLocalDateTime, todayInZone } from '../domain/time';
import type { JourneyInput, JourneyKind } from '../domain/types';
import type { JourneyPlan } from '../services/plan';
import { buildExplanationRequest } from '../services/ai/request';
import { ruleBasedProvider } from '../services/ai/ruleBased';
import { parseUtterance } from '../services/voice/parser';
import type { VoicePatch } from '../services/voice/parser';
import {
  chooseVoiceFlight,
  loadVoiceFlights,
  voiceAnswer,
  voiceJourneyInput,
} from '../services/voice/journey';
import type { VoiceDraft, VoiceFlight } from '../services/voice/journey';
import { recognitionConstructor, VoiceSpeech } from '../services/voice/speech';
import type { SpeechState } from '../services/voice/speech';
import { Button, ui } from './ui';
import styles from './VoiceJourney.module.css';

const zone = DEFAULT_AIRPORT.timeZone;
export function VoiceJourney({
  kind,
  input,
  plan,
  busy,
  error,
  onInput,
  onMonitor,
}: {
  kind: JourneyKind;
  input: JourneyInput | null;
  plan: JourneyPlan | null;
  busy: boolean;
  error: string | null;
  onInput(input: JourneyInput | null): void;
  onMonitor(): void;
}): React.JSX.Element {
  const [draft, setDraft] = useState<VoiceDraft>({
    kind,
    date: todayInZone(Date.now(), zone),
    time: '',
    postcode: '',
  });
  const draftRef = useRef(draft);
  const [text, setText] = useState('');
  const [transcript, setTranscript] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [message, setMessage] = useState(
    'Say the flight time and where it is coming from.',
  );
  const [state, setState] = useState<SpeechState>('idle');
  const [active, setActive] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [working, setWorking] = useState(false);
  const [choices, setChoices] = useState<VoiceFlight[]>([]);
  const [ambiguity, setAmbiguity] = useState<{
    hour: boolean;
    basis: boolean;
  } | null>(null);
  const ambiguityRef = useRef(ambiguity);
  const [matchNote, setMatchNote] = useState('');
  const [approximate, setApproximate] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const speechRef = useRef<VoiceSpeech | null>(null);
  const commandRef = useRef<(text: string) => void>(() => {});
  const responseRef = useRef('');
  const isSupported = Boolean(recognitionConstructor());
  const respond = (value: string): void => {
    responseRef.current = value;
    setMessage(value);
    speechRef.current?.say(value);
  };
  const updateDraft = (next: VoiceDraft): void => {
    draftRef.current = next;
    setDraft(next);
  };
  const setPending = (next: typeof ambiguity): void => {
    ambiguityRef.current = next;
    setAmbiguity(next);
  };
  const invalidate = (): void => {
    abortRef.current?.abort();
    setWorking(false);
    setChoices([]);
    setMatchNote('');
    responseRef.current = '';
    setMessage('Details changed. Check what was understood below.');
    onInput(null);
  };

  useEffect(() => {
    const speech = new VoiceSpeech({
      state: setState,
      transcript: setTranscript,
      final: (value) => commandRef.current(value),
      message: (value) => {
        setMessage(value);
        setEnabled(false);
      },
    });
    speechRef.current = speech;
    const suspend = () => {
      if (document.hidden) {
        speech.stop();
        setEnabled(false);
        abortRef.current?.abort();
        setWorking(false);
        setMessage(
          'Voice paused while the screen was locked or the tab was hidden. Tap Listen to resume.',
        );
      }
    };
    const pagehide = () => {
      speech.stop();
      abortRef.current?.abort();
    };
    document.addEventListener('visibilitychange', suspend);
    window.addEventListener('pagehide', pagehide);
    return () => {
      speech.stop();
      abortRef.current?.abort();
      document.removeEventListener('visibilitychange', suspend);
      window.removeEventListener('pagehide', pagehide);
    };
  }, []);
  // Interim text is visible immediately; screen readers get a debounced transcript.
  useEffect(() => {
    const timer = setTimeout(() => setAnnouncement(transcript), 400);
    return () => clearTimeout(timer);
  }, [transcript]);
  useEffect(() => {
    if (!input) return;
    updateDraft({
      airline:
        input.flightNumber === (draftRef.current.flightNumber || null)
          ? draftRef.current.airline
          : undefined,
      place:
        input.flightNumber === (draftRef.current.flightNumber || null)
          ? draftRef.current.place
          : undefined,
      kind: input.kind,
      date: todayInZone(input.scheduledTime, zone),
      time: formatClock(input.scheduledTime, zone),
      flightNumber: input.flightNumber ?? undefined,
      postcode: input.origin.label,
      passengerRoute: input.passengerRoute,
      terminalCode: input.terminalCode ?? undefined,
      luggage: input.luggage ?? undefined,
    });
  }, [input]);
  useEffect(() => {
    if (!active || busy || !plan || !input) return;
    const answer = voiceAnswer(plan);
    responseRef.current = answer;
    setMessage(answer);
    speechRef.current?.say(`${matchNote} ${answer}`.trim());
  }, [active, busy, plan, input, matchNote]);

  useEffect(() => {
    if (active && error) {
      setMessage(error);
      speechRef.current?.say(error);
    }
  }, [active, error]);

  const calculate = async (next: VoiceDraft, picked = false): Promise<void> => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setWorking(true);
    setState('thinking');
    setChoices([]);
    try {
      let resolved = next;
      let note = '';
      const at = parseLocalDateTime(next.date, next.time || '00:00', zone);
      if (
        at === null ||
        todayInZone(at, zone) !== next.date ||
        formatClock(at, zone) !== (next.time || '00:00')
      ) {
        setDetailsOpen(true);
        respond('Check the flight date and time in the understood details.');
        return;
      }
      if (!picked && (next.flightNumber || next.airline || next.place)) {
        const matches = await loadVoiceFlights(next, controller.signal);
        if (controller.signal.aborted) return;
        if (matches.length > 1) {
          setChoices(matches);
          respond(
            `I found ${matches.length} possible flights. Say “option one”, “option two”, or tap a flight. These are matches in the available data, not a guarantee.`,
          );
          return;
        }
        if (matches[0]) {
          resolved = chooseVoiceFlight(next, matches[0]);
          note = `Matched ${matches[0].number} from ${matches[0].basis} data. Your stated time is kept when supplied.`;
        } else
          note = next.flightNumber
            ? 'No listed flight matched around that time. Keeping your entered flight number and time; existing tracking may still find aircraft or schedule data.'
            : 'No matching flight in the available data. Using your stated time; this does not mean the flight is cancelled.';
      }
      updateDraft(resolved);
      const result = await voiceJourneyInput(
        resolved,
        Date.now(),
        controller.signal,
        input?.origin,
      );
      if (controller.signal.aborted) return;
      if (typeof result === 'string') {
        setDetailsOpen(true);
        respond(`${note} ${result}`.trim());
        return;
      }
      if (input && input.kind === result.kind) {
        result.pickupMode = input.pickupMode;
        result.dropoffMode = input.dropoffMode;
      }
      if (note) setMatchNote(note);
      setDetailsOpen(false);
      onInput(result);
    } catch {
      if (!controller.signal.aborted)
        respond(
          'Could not finish that instruction. Check your connection or use the journey form.',
        );
    } finally {
      if (!controller.signal.aborted) {
        setWorking(false);
      }
    }
  };
  const selectFlight = (flight: VoiceFlight): void => {
    const next = chooseVoiceFlight(draftRef.current, flight);
    updateDraft(next);
    setChoices([]);
    setMatchNote(`Selected ${flight.number} from ${flight.basis} data.`);
    void calculate(next, true);
  };
  const clarifyPending = (hour: 'am' | 'pm' | null, landing: boolean): void => {
    const pending = ambiguityRef.current;
    if (!pending) return;
    const next = { ...draftRef.current };
    if (hour) {
      const h = (Number(next.time.slice(0, 2)) % 12) + (hour === 'pm' ? 12 : 0);
      next.time = `${String(h).padStart(2, '0')}${next.time.slice(2)}`;
    }
    const remaining = {
      hour: pending.hour && !hour,
      basis: pending.basis && !landing,
    };
    updateDraft(next);
    setPending(remaining.hour || remaining.basis ? remaining : null);
    if (remaining.hour || remaining.basis)
      respond(
        remaining.hour
          ? 'Is that AM or PM?'
          : 'Is that the flight landing time? Say “landing time”, or enter the flight time.',
      );
    else void calculate(next);
  };
  const command = (utterance: string): void => {
    speechRef.current?.wait();
    setActive(true);
    setTranscript(utterance);
    setText('');
    const pending = ambiguityRef.current;
    if (
      pending &&
      /^(yes[, ]*)?(am|pm|morning|evening|landing( time)?|yes)[.!?]?$/i.test(
        utterance.trim(),
      )
    ) {
      clarifyPending(
        /am|morning/i.test(utterance)
          ? 'am'
          : /pm|evening/i.test(utterance)
            ? 'pm'
            : null,
        /landing|yes/i.test(utterance),
      );
      return;
    }
    const option = /^(?:option )?(one|two|three|four|five|\d+)[.!?]?$/i.exec(
      utterance.trim(),
    );
    if (option && choices.length) {
      const index = ['one', 'two', 'three', 'four', 'five'].indexOf(
        option[1]!.toLowerCase(),
      );
      const flight = choices[index < 0 ? Number(option[1]) - 1 : index];
      if (flight) {
        selectFlight(flight);
        return;
      }
    }
    const action = parseUtterance(utterance, Date.now(), zone);
    switch (action.type) {
      case 'stop':
        speechRef.current?.stop();
        setEnabled(false);
        abortRef.current?.abort();
        setWorking(false);
        respond('Voice stopped.');
        return;
      case 'clarify':
        respond(action.message);
        return;
      case 'monitor':
        if (
          !input ||
          !plan ||
          busy ||
          working ||
          ambiguity ||
          choices.length ||
          plan.recommendation.kind === 'unavailable'
        )
          respond(
            'Calculate a current recommendation first, then say “start monitoring”.',
          );
        else {
          speechRef.current?.stop();
          setEnabled(false);
          onMonitor();
        }
        return;
      case 'explain':
        if (
          !plan ||
          busy ||
          working ||
          !input ||
          plan.recommendation.kind === 'unavailable'
        ) {
          respond('Calculate a recommendation first.');
          return;
        }
        void ruleBasedProvider
          .explain(
            buildExplanationRequest(plan, plan.recommendation, DEFAULT_AIRPORT),
          )
          .then((explanation) => respond(explanation.text));
        return;
      case 'calculate':
        if (ambiguityRef.current) {
          respond(
            'Please settle the time question first, or edit the flight time control.',
          );
          return;
        }
        void calculate(draftRef.current);
        return;
      case 'update': {
        invalidate();
        const next = { ...draftRef.current, ...action.patch };
        if (action.patch.kind && action.patch.kind !== draftRef.current.kind) {
          next.flightNumber = action.patch.flightNumber;
          next.place = action.patch.place;
          next.airline = action.patch.airline;
        } else if (action.patch.flightNumber) {
          next.airline = action.patch.airline;
          next.place = action.patch.place;
        }
        updateDraft(next);
        setApproximate(action.approximate);
        const questions = {
          hour: action.ambiguousHour,
          basis:
            action.ambiguousBasis ||
            Boolean(pending?.basis && !/land|flight arrival/i.test(utterance)),
        };
        setPending(questions.hour || questions.basis ? questions : null);
        if (questions.hour || questions.basis)
          respond(
            questions.hour
              ? 'Is that AM or PM?'
              : 'Is that the flight landing time? Say “landing time” or enter the flight time.',
          );
        else void calculate(next);
      }
    }
  };
  commandRef.current = command;
  const edit = (patch: VoicePatch): void => {
    setActive(true);
    invalidate();
    updateDraft({ ...draftRef.current, ...patch });
    if (patch.time) setPending(null);
  };
  const visibleState = busy || working ? 'thinking' : state;
  return (
    <section
      className={styles.panel}
      aria-labelledby="voice-heading"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          speechRef.current?.stop();
          setEnabled(false);
          abortRef.current?.abort();
          setWorking(false);
          setMessage('Voice stopped.');
        }
      }}
    >
      <div className={styles.heading}>
        <h2 id="voice-heading">Talk through your journey</h2>
        <span className={styles.state}>{visibleState}</span>
      </div>
      <p id="voice-privacy" className={ui.hint}>
        Your browser may send audio to its speech service. SetoffIQ does not
        record or save audio or transcripts. Type your postcode if you prefer to
        keep it out of speech.
      </p>
      <div className={styles.actions}>
        {isSupported ? (
          <Button
            aria-describedby="voice-privacy"
            onClick={() => {
              setActive(true);
              setEnabled(true);
              speechRef.current?.start();
            }}
          >
            {' '}
            {state === 'speaking' ? 'Interrupt and listen' : 'Listen'}{' '}
          </Button>
        ) : (
          <p className={ui.hint}>
            Speech recognition is unavailable in this browser. Type below.
          </p>
        )}
        {enabled || state === 'speaking' ? (
          <Button
            variant="secondary"
            onClick={() => {
              speechRef.current?.stop();
              setEnabled(false);
              setMessage('Voice stopped.');
            }}
          >
            Stop voice
          </Button>
        ) : null}
        {active && responseRef.current ? (
          <Button
            variant="quiet"
            onClick={() => speechRef.current?.say(responseRef.current, true)}
          >
            Read answer
          </Button>
        ) : null}
      </div>
      <p className={ui.hint}>
        Listening resumes after replies. Tap Listen to interrupt, or press
        Escape to stop. Spoken replies need a local English voice; otherwise use
        the on-screen answer.
      </p>
      {transcript ? (
        <p className={styles.transcript}>Heard: “{transcript}”</p>
      ) : null}
      <span className={styles.sr} aria-live="polite" aria-atomic="true">
        {announcement ? `Heard: ${announcement}` : ''}
      </span>
      {matchNote ? <p className={ui.hint}>{matchNote}</p> : null}
      <p role="status" aria-atomic="true" className={styles.response}>
        {message}
      </p>
      {ambiguity ? (
        <div className={styles.actions}>
          {ambiguity.hour ? (
            <>
              <Button
                variant="secondary"
                onClick={() => clarifyPending('am', false)}
              >
                AM
              </Button>
              <Button
                variant="secondary"
                onClick={() => clarifyPending('pm', false)}
              >
                PM
              </Button>
            </>
          ) : null}
          {ambiguity.basis ? (
            <Button
              variant="secondary"
              onClick={() => clarifyPending(null, true)}
            >
              That is the landing time
            </Button>
          ) : null}
        </div>
      ) : null}
      {choices.length ? (
        <ol className={styles.choices}>
          {choices.map((flight, i) => (
            <li key={`${flight.number}-${flight.at}`}>
              <Button variant="secondary" onClick={() => selectFlight(flight)}>
                Option {i + 1}: {flight.number} · {flight.place} ·{' '}
                {formatClock(flight.at, zone)} · {flight.basis}
                {flight.basis === 'timetable' ? ' (no status)' : ''}
              </Button>
            </li>
          ))}
        </ol>
      ) : null}
      <form
        className={styles.typed}
        onSubmit={(event) => {
          event.preventDefault();
          if (text.trim()) command(text.trim());
        }}
      >
        <label htmlFor="voice-instruction">Or type an instruction</label>
        <div className={styles.entry}>
          <input
            id="voice-instruction"
            className={ui.control}
            value={text}
            onChange={(event) => setText(event.target.value)}
            autoComplete="off"
            placeholder="Landing tomorrow at 18:30, Ryanair from Rabat"
            maxLength={500}
          />
          <Button type="submit">Use instruction</Button>
        </div>
      </form>
      {active ? (
        <p className={styles.understood}>
          Understood:{' '}
          {draft.kind === 'pickup'
            ? 'pickup · landing'
            : 'drop-off · departure'}{' '}
          · {draft.date} · {draft.time || 'time needed'} ·{' '}
          {draft.flightNumber || draft.airline || 'no flight number'}
          {draft.place ? ` · ${draft.place}` : ''}
        </p>
      ) : null}
      <details
        open={detailsOpen}
        onToggle={(event) => {
          setDetailsOpen(event.currentTarget.open);
          if (event.currentTarget.open) setActive(true);
        }}
      >
        <summary className={styles.summary}>
          Understood details · edit any field
        </summary>
        {active ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setPending(null);
              void calculate(draftRef.current);
            }}
          >
            <p className={ui.hint}>
              {approximate
                ? 'Approximate time heard; treated as the entered flight time. Check your booking. '
                : ''}
              Manchester time. Quick pickup / drop-off, international unless
              known, bags allowed unless hand luggage only.
            </p>
            <div className={styles.fields}>
              <label>
                Journey
                <select
                  aria-label="Voice journey type"
                  className={ui.control}
                  value={draft.kind}
                  onChange={(e) =>
                    edit({
                      kind: e.target.value as JourneyKind,
                      flightNumber: undefined,
                      place: undefined,
                      airline: undefined,
                    })
                  }
                >
                  <option value="pickup">Pickup</option>
                  <option value="dropoff">Drop-off</option>
                </select>
              </label>
              <label>
                Starting postcode
                <input
                  aria-label="Voice starting postcode"
                  className={ui.control}
                  value={draft.postcode}
                  onChange={(e) => edit({ postcode: e.target.value })}
                  autoComplete="postal-code"
                />
              </label>
              <label>
                Flight date
                <input
                  aria-label="Voice flight date"
                  type="date"
                  className={ui.control}
                  value={draft.date}
                  onChange={(e) => edit({ date: e.target.value })}
                  required
                />
              </label>
              <label>
                {draft.kind === 'pickup' ? 'Landing time' : 'Departure time'}
                <input
                  aria-label="Voice flight time"
                  type="time"
                  className={ui.control}
                  value={draft.time}
                  onChange={(e) => edit({ time: e.target.value })}
                  required
                />
              </label>
              <label>
                Flight number
                <input
                  aria-label="Voice flight number"
                  className={ui.control}
                  value={draft.flightNumber ?? ''}
                  onChange={(e) =>
                    edit({
                      flightNumber: e.target.value
                        .toUpperCase()
                        .replace(/\s/g, ''),
                      airline: undefined,
                      place: undefined,
                    })
                  }
                />
              </label>
              <label>
                Airline
                <input
                  className={ui.control}
                  value={draft.airline ?? ''}
                  onChange={(e) =>
                    edit({ airline: e.target.value || undefined })
                  }
                />
              </label>
              <label>
                {draft.kind === 'pickup' ? 'From' : 'To'}
                <input
                  aria-label="Voice flight place"
                  className={ui.control}
                  value={draft.place ?? ''}
                  onChange={(e) => edit({ place: e.target.value || undefined })}
                />
              </label>
              <label>
                Route
                <select
                  className={ui.control}
                  value={draft.passengerRoute ?? 'international'}
                  onChange={(e) =>
                    edit({
                      passengerRoute:
                        e.target.value === 'domestic'
                          ? 'domestic'
                          : 'international',
                    })
                  }
                >
                  <option value="international">International</option>
                  <option value="domestic">Within the UK</option>
                </select>
              </label>
              <label>
                Bags
                <select
                  className={ui.control}
                  value={draft.luggage ?? 'checked'}
                  onChange={(e) =>
                    edit({
                      luggage:
                        e.target.value === 'hand-only'
                          ? 'hand-only'
                          : 'checked',
                    })
                  }
                >
                  <option value="checked">Allow for checked bags</option>
                  <option value="hand-only">Hand luggage only</option>
                </select>
              </label>
              <label>
                Terminal
                <select
                  className={ui.control}
                  value={draft.terminalCode ?? ''}
                  onChange={(e) =>
                    edit({ terminalCode: e.target.value || undefined })
                  }
                >
                  <option value="">Not sure</option>
                  {DEFAULT_AIRPORT.terminals.map((t) => (
                    <option key={t.code}>{t.code}</option>
                  ))}
                </select>
              </label>
            </div>
            <Button
              type="submit"
              disabled={working || busy || Boolean(ambiguity)}
            >
              Calculate understood journey
            </Button>
          </form>
        ) : null}
      </details>
    </section>
  );
}
