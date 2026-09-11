import { ollamaProvider } from './ollama';
import { ruleBasedProvider } from './ruleBased';
import type { Explanation, ExplanationRequest } from './types';

/**
 * Try the local model if the user has switched it on and it answers quickly;
 * otherwise explain the recommendation from its own numbers. Either way an
 * explanation always appears, and it is always labelled with where it came
 * from.
 */
export async function explainRecommendation(
  request: ExplanationRequest,
  useLocalModel: boolean,
  signal?: AbortSignal,
): Promise<Explanation> {
  if (useLocalModel && (await ollamaProvider.isAvailable(signal))) {
    try {
      return await ollamaProvider.explain(request, signal);
    } catch {
      // Fall through to the deterministic explanation.
    }
  }
  return ruleBasedProvider.explain(request, signal);
}

export { ollamaProvider, ruleBasedProvider };
export type { AIProvider, Explanation, ExplanationRequest } from './types';
export { buildExplanationRequest } from './request';
