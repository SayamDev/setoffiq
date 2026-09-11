import { useCallback, useEffect, useRef, useState } from 'react';
import type { JourneyInput } from '../domain/types';
import { planJourney, type JourneyPlan } from '../services/plan';

export type PlanStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface PlanState {
  status: PlanStatus;
  plan: JourneyPlan | null;
  error: string | null;
}

/**
 * Runs the planner for a journey and re-runs it on demand.
 *
 * Every run is abortable, so navigating away mid-request does not leave a
 * response landing in an unmounted screen — or, worse, a retry loop running
 * against a free public service after the user has gone.
 */
export function useJourneyPlan(input: JourneyInput | null): PlanState & { refresh: () => void } {
  const [state, setState] = useState<PlanState>({ status: 'idle', plan: null, error: null });
  const abortRef = useRef<AbortController | null>(null);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((value) => value + 1), []);

  useEffect(() => {
    if (!input) {
      setState({ status: 'idle', plan: null, error: null });
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState((current) => ({ ...current, status: 'loading', error: null }));

    planJourney(input, Date.now(), controller.signal)
      .then((plan) => {
        if (controller.signal.aborted) return;
        setState({ status: 'ready', plan, error: null });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setState({
          status: 'error',
          plan: null,
          error: "We couldn't build a recommendation just now. Check your connection and try again.",
        });
      });

    return () => controller.abort();
  }, [input, nonce]);

  return { ...state, refresh };
}
