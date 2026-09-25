import { useEffect, useState } from 'react';
import type { JourneyInput } from '../domain/types';
import { loadFlightRoute, type FlightRoute } from '../services/flight';

/**
 * Where a journey's flight goes to or comes from. Undefined while loading,
 * null when it cannot be worked out (no flight number, or not timetabled).
 *
 * The timetable behind it is cached in the browser, so a list of journeys
 * asking at once makes one request, not one each.
 */
export function useFlightRoute(input: JourneyInput | null): FlightRoute | null | undefined {
  const [route, setRoute] = useState<FlightRoute | null | undefined>(undefined);
  const kind = input?.kind ?? 'pickup';
  const flightNumber = input?.flightNumber ?? null;
  const scheduledTime = input?.scheduledTime ?? 0;

  useEffect(() => {
    if (!flightNumber) {
      setRoute(null);
      return;
    }
    const controller = new AbortController();
    loadFlightRoute(kind, flightNumber, scheduledTime, controller.signal).then(
      (found) => {
        if (!controller.signal.aborted) setRoute(found);
      },
      () => {
        if (!controller.signal.aborted) setRoute(null);
      },
    );
    return () => controller.abort();
  }, [kind, flightNumber, scheduledTime]);

  return route;
}
