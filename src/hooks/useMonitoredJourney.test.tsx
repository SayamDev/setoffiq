import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useMonitoredJourney } from './useMonitoredJourney';
import { MANCHESTER } from '../domain/airports';
import { createJourney, correctBookingTime } from '../storage/journeys';
import { DEFAULT_SETTINGS } from '../storage/settings';
import { planJourney, type JourneyPlan } from '../services/plan';
vi.mock('../services/plan', () => ({ planJourney: vi.fn() }));

it('rechecks a corrected booking and discards the old in-flight request', async () => {
  const now = Date.now();
  const original = createJourney('RK1712', {
    kind: 'pickup', airportIata: 'MAN', flightNumber: 'RK1712', scheduledTime: now + 86400000,
    passengerRoute: 'international', terminalCode: 'T3', origin: { latitude: 53.48, longitude: -2.24, label: 'Manchester' },
    pickupMode: 'short-stay', dropoffMode: null, scenarioId: null,
  }, now);
  const corrected = correctBookingTime(original, original.input.scheduledTime - 3600000, 'Europe/London', now);
  const empty = { state: 'unavailable' as const, value: null, fetchedAt: null, observedAt: null, provider: 'test', attribution: null, message: null };
  const plan: JourneyPlan = { computedAt: now, recommendation: { kind: 'unavailable', computedAt: now, headline: 'Test result', detail: 'Fixture' }, flight: empty, route: empty, weather: empty, airportConditions: empty, roadDisruption: empty, terminal: null, flightRoute: null };
  let finishOld!: (plan: JourneyPlan) => void;
  let finishNew!: (plan: JourneyPlan) => void;
  vi.mocked(planJourney).mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }))
    .mockImplementationOnce(() => new Promise(resolve => { finishNew = resolve; }));
  const onChange = vi.fn();
  const { result, rerender, unmount } = renderHook(({ journey }) => useMonitoredJourney(journey, MANCHESTER, DEFAULT_SETTINGS, onChange), { initialProps: { journey: original } });
  rerender({ journey: corrected });
  expect(vi.mocked(planJourney).mock.calls[0]![2]?.aborted).toBe(true);
  expect(vi.mocked(planJourney).mock.calls[1]![0].scheduledTime).toBe(corrected.input.scheduledTime);
  await act(async () => finishOld(plan));
  expect(onChange).not.toHaveBeenCalled();
  expect(result.current.plan).toBeNull();
  await act(async () => finishNew(plan));
  await waitFor(() => expect(result.current.status).toBe('ready'));
  expect(onChange.mock.calls[0]![0].input.scheduledTime).toBe(corrected.input.scheduledTime);
  unmount();
});
