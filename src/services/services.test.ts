import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readCache, writeCache } from './cache';
import { fetchJson, ProviderError, resetHttpState } from './http';
import { clearAll } from './storage';
import { ApiUsageTracker } from './usage';
import { openMeteoProvider } from './weather';
import { osrmRoutingProvider } from './routing';
import { geocodePostcode, isValidPostcodeShape } from './routing';

const NOW = Date.UTC(2026, 8, 16, 17, 42);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  clearAll();
  resetHttpState();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('cache', () => {
  it('returns a fresh hit inside the TTL', () => {
    writeCache('key', { value: 1 }, NOW);
    const hit = readCache<{ value: number }>('key', 60, NOW + 10 * 60_000);
    expect(hit?.fresh).toBe(true);
    expect(hit?.ageMinutes).toBe(10);
  });

  it('still returns an expired entry, marked stale', () => {
    // Showing clearly-labelled old data beats showing nothing.
    writeCache('key', { value: 1 }, NOW);
    const hit = readCache<{ value: number }>('key', 60, NOW + 120 * 60_000);
    expect(hit).not.toBeNull();
    expect(hit?.fresh).toBe(false);
    expect(hit?.ageMinutes).toBe(120);
  });

  it('returns null when nothing was cached', () => {
    expect(readCache('missing', 60, NOW)).toBeNull();
  });
});

describe('ApiUsageTracker', () => {
  it('counts requests per provider within a window', () => {
    const tracker = new ApiUsageTracker();
    tracker.record('open-meteo', 'forecast', 'success', NOW);
    tracker.record('open-meteo', 'forecast', 'success', NOW - 2 * 60 * 60_000);
    tracker.record('osrm', 'route', 'failure', NOW);

    expect(tracker.countSince('open-meteo', NOW - 60 * 60_000)).toBe(1);
    expect(tracker.countSince('open-meteo', NOW - 24 * 60 * 60_000)).toBe(2);

    const summary = tracker.summarise(NOW);
    const osrm = summary.find((entry) => entry.provider === 'osrm');
    expect(osrm?.lastFailureAt).toBe(NOW);
    expect(osrm?.lastSuccessAt).toBeNull();
  });

  it('signals a back-off before a documented limit is reached', () => {
    const tracker = new ApiUsageTracker();
    expect(tracker.shouldBackOff('open-meteo', NOW)).toBe(false);
    for (let index = 0; index < 8_100; index += 1) {
      tracker.record('open-meteo', 'forecast', 'success', NOW);
    }
    expect(tracker.shouldBackOff('open-meteo', NOW)).toBe(true);
  });
});

describe('fetchJson', () => {
  it('retries a server error and then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchJson<{ ok: boolean }>('https://example.test/a', {
      provider: 'test',
      endpoint: 'a',
    });
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry a client error', async () => {
    // Repeating a request the server has already rejected is exactly the
    // pointless traffic these free services ask us not to generate.
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 404));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchJson('https://example.test/b', { provider: 'test', endpoint: 'b' }),
    ).rejects.toBeInstanceOf(ProviderError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gives up after the retry budget', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 500));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchJson('https://example.test/c', { provider: 'test', endpoint: 'c', retries: 1 }),
    ).rejects.toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('deduplicates concurrent requests for the same url', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const [first, second] = await Promise.all([
      fetchJson('https://example.test/d', { provider: 'test', endpoint: 'd' }),
      fetchJson('https://example.test/d', { provider: 'test', endpoint: 'd' }),
    ]);
    expect(first).toEqual(second);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('postcode lookup', () => {
  it('recognises valid UK postcode shapes without a request', () => {
    expect(isValidPostcodeShape('M1 4BT')).toBe(true);
    expect(isValidPostcodeShape('m904jd')).toBe(true);
    expect(isValidPostcodeShape('M90')).toBe(true);
    expect(isValidPostcodeShape('not a postcode')).toBe(false);
    expect(isValidPostcodeShape('90210')).toBe(false);
  });

  it('rejects a malformed postcode without contacting the service', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await geocodePostcode('nonsense');
    expect(result.state).toBe('unavailable');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns coordinates and caches them', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        status: 200,
        result: { postcode: 'M1 4BT', latitude: 53.4794, longitude: -2.2453, admin_district: 'Manchester', country: 'England' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const first = await geocodePostcode('m14bt');
    expect(first.value?.latitude).toBeCloseTo(53.4794);
    expect(first.value?.label).toBe('M1 4BT');

    resetHttpState();
    const second = await geocodePostcode('M1 4BT');
    expect(second.state).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('weather provider', () => {
  const point = { latitude: 53.35, longitude: -2.27, label: 'MAN' };

  it('normalises an Open-Meteo response into a snapshot', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          hourly: {
            time: ['2026-09-16T17:00', '2026-09-16T18:00'],
            temperature_2m: [14, 13],
            precipitation: [0, 2.4],
            wind_speed_10m: [12, 18],
            wind_gusts_10m: [20, 30],
            visibility: [24000, 8000],
            weather_code: [1, 63],
          },
        }),
      ),
    );

    const result = await openMeteoProvider.getWeather(point, Date.UTC(2026, 8, 16, 18, 20));
    expect(result.state).toBe('ok');
    expect(result.value?.description).toBe('Rain');
    expect(result.value?.severity).toBe('moderate');
    expect(result.value?.precipitationMm).toBe(2.4);
    expect(result.attribution).toContain('Open-Meteo');
  });

  it('escalates severity when wind or visibility is bad, whatever the code says', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          hourly: {
            time: ['2026-09-16T18:00'],
            temperature_2m: [9],
            precipitation: [0],
            wind_speed_10m: [64],
            wind_gusts_10m: [95],
            visibility: [600],
            weather_code: [1],
          },
        }),
      ),
    );

    const result = await openMeteoProvider.getWeather(point, Date.UTC(2026, 8, 16, 18, 20));
    expect(result.value?.severity).toBe('poor');
  });

  it('reports unavailable rather than guessing when the service fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const result = await openMeteoProvider.getWeather(point, Date.UTC(2026, 8, 16, 18, 20));
    expect(result.state).toBe('unavailable');
    expect(result.value).toBeNull();
    expect(result.message).not.toContain('network down');
  });
});

describe('routing provider', () => {
  const origin = { latitude: 53.4794, longitude: -2.2453, label: 'M1 4BT' };
  const destination = { latitude: 53.3537, longitude: -2.275, label: 'MAN' };

  it('falls back to the second public instance when the first fails', async () => {
    // Each host gets exactly one attempt: the second instance is the retry.
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('first host down'))
      .mockResolvedValue(
        jsonResponse({ code: 'Ok', routes: [{ duration: 1251.9, distance: 14919.4 }] }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await osrmRoutingProvider.calculateRoute({ origin, destination });
    expect(result.state).toBe('ok');
    expect(result.value?.durationSeconds).toBeCloseTo(1251.9);
    expect(result.value?.trafficAware).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports unavailable when every instance fails, without inventing a time', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('all down')));
    const result = await osrmRoutingProvider.calculateRoute({ origin, destination });
    expect(result.state).toBe('unavailable');
    expect(result.value).toBeNull();
  });

  it('serves a repeated identical journey from cache', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ code: 'Ok', routes: [{ duration: 900, distance: 12000 }] }));
    vi.stubGlobal('fetch', fetchMock);

    await osrmRoutingProvider.calculateRoute({ origin, destination });
    resetHttpState();
    const second = await osrmRoutingProvider.calculateRoute({ origin, destination });

    expect(second.state).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
