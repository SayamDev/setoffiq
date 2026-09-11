import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { clearAll } from '../services/storage';
import { resetHttpState } from '../services/http';
import { todayInZone } from '../domain/time';
import { MANCHESTER } from '../domain/airports';

/**
 * The whole product, end to end:
 *
 *   enter a flight → pick a date → enter an origin → choose a pickup style
 *   → calculate → see a recommendation → monitor it → the flight moves
 *   → the recommendation is recalculated → the user is told what changed.
 *
 * Every external service is stubbed at the network boundary, so this exercises
 * the real providers, the real cache, the real engine and the real UI.
 */

/** Distance of the aircraft from Manchester, adjusted mid-test to move the arrival. */
let aircraftLatitude = 54.6;

function snapshot(): unknown {
  return {
    generatedAt: new Date().toISOString(),
    airportIcao: 'EGCC',
    source: 'test',
    attribution: 'test',
    radiusKm: 300,
    aircraft: [
      {
        callsign: 'KLM1038',
        icao24: '484dab',
        latitude: aircraftLatitude,
        longitude: -2.4,
        baroAltitudeM: 6000,
        geoAltitudeM: 6100,
        groundSpeedMps: 170,
        verticalRateMps: -6,
        onGround: false,
        lastContact: Math.floor(Date.now() / 1000),
      },
    ],
  };
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function stubNetwork(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('postcodes.io')) {
        return json({
          status: 200,
          result: { postcode: 'M1 4BT', latitude: 53.4794, longitude: -2.2453, admin_district: 'Manchester', country: 'England' },
        });
      }
      if (url.includes('route/v1/driving')) {
        return json({ code: 'Ok', routes: [{ duration: 2520, distance: 30_000 }] });
      }
      if (url.includes('open-meteo')) {
        const hour = new Date().toISOString().slice(0, 13);
        return json({
          hourly: {
            time: [`${hour}:00`],
            temperature_2m: [14],
            precipitation: [0],
            wind_speed_10m: [10],
            wind_gusts_10m: [15],
            visibility: [24_000],
            weather_code: [1],
          },
        });
      }
      if (url.includes('data/flights')) {
        return json(snapshot());
      }
      throw new Error(`unexpected request: ${url}`);
    }),
  );
}

beforeEach(() => {
  clearAll();
  resetHttpState();
  aircraftLatitude = 54.6;
  window.location.hash = '#/';
  stubNetwork();
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearAll();
});

describe('planning and monitoring a pickup', () => {
  it('takes a flight through to a recommendation, then updates it when the flight moves', async () => {
    const user = userEvent.setup();
    render(<App />);

    // 1. Choose what we are doing.
    await user.click(screen.getByRole('link', { name: /Plan a pickup/i }));

    // 2. Fill the journey in.
    const arrival = new Date(Date.now() + 4 * 60 * 60_000);
    // Date and time inputs take a value directly rather than keystrokes.
    fireEvent.change(screen.getByLabelText('Date'), {
      target: { value: todayInZone(arrival.getTime(), MANCHESTER.timeZone) },
    });
    fireEvent.change(screen.getByLabelText(/Scheduled arrival time/i), {
      target: { value: `${String(arrival.getHours()).padStart(2, '0')}:00` },
    });
    await user.type(screen.getByLabelText(/Flight number/i), 'KL1038');
    await user.type(screen.getByLabelText(/Setting off from/i), 'M1 4BT');
    await user.click(screen.getByRole('radio', { name: /Quick pickup/i }));

    // 3. Calculate.
    await user.click(screen.getByRole('button', { name: /Calculate my journey/i }));

    const recommendation = await screen.findByRole('region', { name: /Recommended departure/i }, { timeout: 5000 });
    const firstDeparture = within(recommendation)
      .getByText(/^\d{2}:\d{2}$/)
      .textContent!;
    expect(firstDeparture).toMatch(/^\d{2}:\d{2}$/);

    // The aircraft was found, so the recommendation is built on a live position.
    expect(await screen.findByText(/Estimated landing/i)).toBeInTheDocument();
    expect(screen.getByText(/KLM1038/)).toBeInTheDocument();

    // A readiness window, not a single promised moment.
    expect(screen.getByText('Passenger likely ready')).toBeInTheDocument();
    // Readiness and airport arrival are both shown as windows, never as a
    // single promised moment.
    expect(within(recommendation).getAllByText(/^\d{2}:\d{2}–\d{2}:\d{2}$/).length).toBeGreaterThanOrEqual(2);

    // 4. Start monitoring.
    await user.click(screen.getByRole('button', { name: /Monitor this journey/i }));
    expect(await screen.findByRole('button', { name: /Check now/i })).toBeInTheDocument();

    // 5. The flight moves: the aircraft is now much further out, so it will
    //    arrive later and the driver should leave later.
    aircraftLatitude = 57.4;
    await user.click(screen.getByRole('button', { name: /Check now/i }));

    // 6. The user is told what changed, and the recommendation really moved.
    const notice = await screen.findByText(/Your departure time changed/i, undefined, {
      timeout: 5000,
    });
    expect(notice).toBeInTheDocument();
    expect((await screen.findAllByText(/minutes later/i)).length).toBeGreaterThan(0);

    const updated = screen.getByRole('region', { name: /Recommended departure/i });
    const secondDeparture = within(updated)
      .getByText(/^\d{2}:\d{2}$/)
      .textContent!;
    expect(secondDeparture).not.toBe(firstDeparture);

    // 7. It is recorded, so the change is auditable afterwards.
    expect(await screen.findByText(/Departure moved from/i)).toBeInTheDocument();
  }, 30_000);

  it('refuses to recommend a departure for a cancelled flight', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/diagnostics';
    render(<App />);

    await user.selectOptions(await screen.findByLabelText('Scenario'), 'cancelled');
    await user.click(screen.getByRole('button', { name: /Create test journey/i }));

    // The headline appears both as the alert and in the activity log.
    const mentions = await screen.findAllByText(/This flight is showing as cancelled/i, undefined, {
      timeout: 5000,
    });
    expect(mentions.length).toBeGreaterThan(0);
    expect(screen.getByText(/Monitoring has been stopped/i)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /Recommended departure/i })).not.toBeInTheDocument();
  }, 30_000);
});
