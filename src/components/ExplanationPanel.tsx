import { useEffect, useState } from 'react';
import type { AirportProfile, Recommendation } from '../domain/types';
import { buildExplanationRequest, explainRecommendation, type Explanation } from '../services/ai';
import type { JourneyPlan } from '../services/plan';
import { Skeleton, ui } from './ui';

/**
 * The plain-language version of the recommendation.
 *
 * The engine has already decided every number by the time this runs. A local
 * model, if the user has one and has switched it on, only rewords them — and
 * when there is no model, which is the normal case, the label says so rather
 * than implying otherwise.
 */
export function ExplanationPanel({
  plan,
  recommendation,
  airport,
  useLocalModel,
}: {
  plan: JourneyPlan;
  recommendation: Recommendation;
  airport: AirportProfile;
  useLocalModel: boolean;
}): React.JSX.Element {
  const [explanation, setExplanation] = useState<Explanation | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setExplanation(null);

    explainRecommendation(
      buildExplanationRequest(plan, recommendation, airport),
      useLocalModel,
      controller.signal,
    )
      .then((result) => {
        if (active) setExplanation(result);
      })
      .catch(() => {
        /* explainRecommendation already falls back; nothing left to do */
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [plan, recommendation, airport, useLocalModel]);

  if (!explanation) {
    return (
      <div aria-busy="true" aria-label="Preparing your explanation">
        <Skeleton height="1rem" />
        <div style={{ height: '0.5rem' }} />
        <Skeleton height="1rem" width="88%" />
      </div>
    );
  }

  return (
    <div>
      <p>{explanation.text}</p>
      <p className={ui.hint} style={{ marginTop: 'var(--space-3)' }}>
        {explanation.source === 'local-ai'
          ? `Written by a local model (${explanation.model}) from the figures above. The times themselves come from SetoffIQ's calculation, not the model.`
          : 'Standard recommendation explanation, assembled from the figures above. No AI model was involved.'}
      </p>
    </div>
  );
}
