import { afterEach, describe, expect, it, vi } from 'vitest';
import { localModelConfigured, ollamaProvider } from './ollama';

describe('local model discovery', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  // The published site must never reach into a visitor's loopback address.
  it('never contacts localhost from a production build without a configured model', async () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_OLLAMA_URL', '');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    expect(localModelConfigured()).toBe(false);
    await expect(ollamaProvider.isAvailable()).resolves.toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('still looks for one when a build is pointed at it', async () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_OLLAMA_URL', 'http://localhost:11434');
    const fetchSpy = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);

    await expect(ollamaProvider.isAvailable()).resolves.toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith('http://localhost:11434/api/tags', expect.anything());
  });
});
