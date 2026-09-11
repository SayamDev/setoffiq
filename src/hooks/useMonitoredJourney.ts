import { useCallback, useEffect, useRef, useState } from 'react';
import {
  advisoryAt,
  compareRecommendations,
  nextPollDelayMinutes,
  notificationTitle,
  toVersion,
} from '../domain/engine';
import { formatClock } from '../domain/time';
import type { AirportProfile, Instant, SavedJourney } from '../domain/types';
import { planJourney, type JourneyPlan } from '../services/plan';
import { showNotification } from '../services/notifications';
import { appendEvent, appendVersion, latestVersion, newId, setMonitoring } from '../storage/journeys';
import type { Settings } from '../storage/settings';

export interface MonitorChange {
  previousDeparture: Instant;
  nextDeparture: Instant;
  reason: string;
}

/** What the last check found, so "Check now" visibly answers. */
export interface MonitorOutcome {
  at: Instant;
  message: string;
}

export interface MonitorState {
  status: 'idle' | 'checking' | 'ready' | 'error';
  plan: JourneyPlan | null;
  error: string | null;
  change: MonitorChange | null;
  nextCheckAt: Instant | null;
  outcome: MonitorOutcome | null;
}

/**
 * Monitoring, honestly scoped.
 *
 * A static browser app cannot run when the browser is closed, so this checks
 * while SetoffIQ is open and checks again immediately when the tab becomes
 * visible. It does not pretend to be a background service, and the UI says so.
 *
 * The polling interval comes from the engine and widens with distance from the
 * flight, so a journey being watched overnight makes a handful of requests, not
 * thousands.
 */
export function useMonitoredJourney(
  journey: SavedJourney | null,
  airport: AirportProfile,
  settings: Settings,
  onJourneyChange: (journey: SavedJourney) => void,
): MonitorState & { check: () => void; dismissChange: () => void } {
  const [state, setState] = useState<MonitorState>({
    status: 'idle',
    plan: null,
    error: null,
    change: null,
    nextCheckAt: null,
    outcome: null,
  });

  const journeyRef = useRef(journey);
  journeyRef.current = journey;
  const onChangeRef = useRef(onJourneyChange);
  onChangeRef.current = onJourneyChange;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const runningRef = useRef(false);

  const check = useCallback(async (forceRefresh = false): Promise<void> => {
    const current = journeyRef.current;
    if (!current || runningRef.current) return;
    runningRef.current = true;
    setState((previous) => ({ ...previous, status: 'checking', error: null }));

    const controller = new AbortController();
    try {
      const now = Date.now();
      const plan = await planJourney(current.input, now, controller.signal, { forceRefresh });
      const phase = plan.flight.value?.phase ?? 'unknown';

      let updated: SavedJourney = { ...current, lastCheckedAt: now };
      let change: MonitorChange | null = null;
      // The time is in the message: pressing "Check now" twice must visibly
      // answer twice, even when the answer is the same — so to the second,
      // since two presses a few seconds apart share a minute.
      const stamp = formatClockToSecond(now, airport.timeZone);
      let outcome = `Checked at ${stamp} — nothing changed.`;

      if (plan.recommendation.kind === 'unavailable') {
        // A cancellation or diversion is exactly when monitoring should stop
        // rather than keep polling a flight that is not coming.
        updated = setMonitoring(updated, 'stopped', now);
        updated = appendEvent(updated, 'flight-updated', plan.recommendation.headline, now);
        outcome = `Checked at ${stamp} — ${plan.recommendation.headline.toLowerCase()}. Monitoring stopped.`;
      } else {
        const previous = latestVersion(current);
        const comparison = previous
          ? compareRecommendations(
              previous,
              plan.recommendation,
              phase,
              settingsRef.current.notificationThresholdMinutes,
            )
          : null;

        if (!previous) {
          updated = appendVersion(
            updated,
            toVersion(plan.recommendation, phase, plan.flight.observedAt, null, newId(now)),
          );
          outcome = `Checked at ${stamp} — leave at ${formatClock(plan.recommendation.recommendedDeparture, airport.timeZone)}.`;
        } else if (comparison?.meaningful) {
          updated = appendVersion(
            updated,
            toVersion(
              plan.recommendation,
              phase,
              plan.flight.observedAt,
              comparison.reason,
              newId(now),
            ),
          );
          updated = appendEvent(
            updated,
            'recommendation-changed',
            `Departure moved from ${formatClock(previous.departure, airport.timeZone)} to ${formatClock(plan.recommendation.recommendedDeparture, airport.timeZone)}${plan.recommendation.recommendedDeparture < now ? ', which has already passed' : ''}. ${comparison.reason}`,
            now,
          );
          change = {
            previousDeparture: previous.departure,
            nextDeparture: plan.recommendation.recommendedDeparture,
            reason: comparison.reason,
          };
          outcome = `Checked at ${stamp} — departure moved to ${formatClock(plan.recommendation.recommendedDeparture, airport.timeZone)}. ${comparison.reason}`;

          if (settingsRef.current.notificationsEnabled) {
            const advice = advisoryAt(plan.recommendation, now, airport.timeZone);
            const shown = await showNotification({
              id: newId(now),
              journeyId: current.id,
              at: now,
              title: notificationTitle(
                advice,
                plan.recommendation.recommendedDeparture,
                airport.timeZone,
              ),
              // Behind schedule, the news that it moved matters less than
              // how far behind: say both.
              body:
                advice.kind === 'running-late'
                  ? `${comparison.reason} ${advice.detail}`
                  : comparison.reason,
            });
            if (shown) updated = appendEvent(updated, 'notified', 'You were notified of this change.', now);
          }
        } else {
          /*
           * Nothing changed, so nothing is recorded. Logging every check
           * filled the activity list with dozens of identical lines and
           * buried the entries that matter. "Last checked" and the line under
           * the buttons already say a check happened.
           */
          outcome = `Checked at ${stamp} — nothing changed. Departure stays at ${formatClock(plan.recommendation.recommendedDeparture, airport.timeZone)}.`;
        }
      }

      onChangeRef.current(updated);

      const eventTime = current.input.scheduledTime;
      const delay = nextPollDelayMinutes(now, eventTime, phase);
      setState({
        status: 'ready',
        plan,
        error: null,
        change,
        nextCheckAt: delay === null ? null : now + delay * 60_000,
        outcome: { at: now, message: outcome },
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      const current2 = journeyRef.current;
      if (current2) {
        onChangeRef.current(
          appendEvent(
            current2,
            'provider-failed',
            "A check failed. SetoffIQ kept the last recommendation it could calculate.",
            Date.now(),
          ),
        );
      }
      setState((previous) => ({
        ...previous,
        status: 'error',
        error: "We couldn't refresh this journey just now.",
        outcome: {
          at: Date.now(),
          message: `The check at ${formatClockToSecond(Date.now(), airport.timeZone)} failed — the last recommendation is still shown.`,
        },
      }));
    } finally {
      runningRef.current = false;
    }
  }, [airport.timeZone]);

  // Check on open, and again whenever the tab comes back to the foreground.
  useEffect(() => {
    if (!journey) return;
    void check();
    const onVisible = (): void => {
      if (document.visibilityState === 'visible' && journeyRef.current?.monitoring === 'active') {
        void check();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
    // Deliberately narrow dependencies. A journey object changes on every event
    // append, so depending on the whole object would be a request loop. The
    // scenario id is included because changing it changes what the flight
    // provider will return, and the recommendation has to be rebuilt from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journey?.id, journey?.input.scenarioId, check]);

  useEffect(() => {
    if (!state.nextCheckAt || journey?.monitoring !== 'active') return;
    const delay = Math.max(30_000, state.nextCheckAt - Date.now());
    const timer = setTimeout(() => void check(), delay);
    return () => clearTimeout(timer);
  }, [state.nextCheckAt, journey?.monitoring, check]);

  const dismissChange = useCallback(() => {
    setState((previous) => ({ ...previous, change: null }));
  }, []);

  // "Check now" is a deliberate act, so it bypasses the snapshot cache.
  return { ...state, check: () => void check(true), dismissChange };
}

/** Clock time to the second, for a line that must change on every press. */
function formatClockToSecond(instant: Instant, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(instant));
}

