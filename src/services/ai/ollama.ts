import type { AIProvider, Explanation, ExplanationRequest } from './types';

const DEFAULT_ENDPOINT = 'http://localhost:11434';
const DEFAULT_MODEL = 'llama3.2';

const SYSTEM_PROMPT = [
  'You explain a travel recommendation that has already been calculated.',
  'You must not change, recompute or contradict any time, window or duration you are given.',
  'Write two to four short sentences in calm, plain British English.',
  'Never promise an exact moment; the windows given to you are ranges for a reason.',
  'Do not invent traffic conditions, queue lengths, parking prices or airport policies.',
].join(' ');

function endpoint(): string {
  return import.meta.env.VITE_OLLAMA_URL || DEFAULT_ENDPOINT;
}

function model(): string {
  return import.meta.env.VITE_OLLAMA_MODEL || DEFAULT_MODEL;
}

/**
 * Optional local explanation via Ollama.
 *
 * This is a development convenience, never a requirement: the public site has
 * no model behind it and falls back to the rule-based explanation. The model
 * only ever rewords numbers the deterministic engine produced — it has no say
 * in what those numbers are.
 */
export const ollamaProvider: AIProvider = {
  id: 'ollama',
  label: 'Local model (Ollama)',

  async isAvailable(signal): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1_500);
      signal?.addEventListener('abort', () => controller.abort(), { once: true });
      const response = await fetch(`${endpoint()}/api/tags`, { signal: controller.signal });
      clearTimeout(timer);
      return response.ok;
    } catch {
      return false;
    }
  },

  async explain(request: ExplanationRequest, signal): Promise<Explanation> {
    const response = await fetch(`${endpoint()}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal,
      body: JSON.stringify({
        model: model(),
        system: SYSTEM_PROMPT,
        prompt: JSON.stringify(request),
        stream: false,
        options: { temperature: 0.2 },
      }),
    });
    if (!response.ok) throw new Error(`ollama responded ${response.status}`);
    const payload = (await response.json()) as { response?: string };
    const text = payload.response?.trim();
    if (!text) throw new Error('empty response');
    return { text, source: 'local-ai', model: model() };
  },
};
