import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { clearAll, listKeys, readRaw } from '../services/storage';
import { resetHttpState } from '../services/http';
import { formatClock, todayInZone, parseLocalDateTime } from '../domain/time';
import { MANCHESTER } from '../domain/airports';
import type { ScheduledFlight } from '../services/flight/schedule';
import { CHECK_COOLDOWN_SECONDS } from '../components/CheckNowButton';

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
let scheduledFlights: ScheduledFlight[] = [];

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
      if (url.includes('EGCC-schedule.json')) return json({ generatedAt: new Date().toISOString(), attribution: 'test', arrivals: scheduledFlights, departures: [] });
      if (url.includes('data/flights')) {
        return json(snapshot());
      }
      if (url.includes('data/airport')) {
        return json({
          generatedAt: new Date().toISOString(),
          icaoCode: 'EGCC',
          source: 'test',
          attribution: 'test',
          conditions: {
            icaoCode: 'EGCC',
            observedAt: Date.now(),
            temperatureC: 16,
            windDirectionDeg: 260,
            windSpeedKt: 6,
            visibility: '6+',
            ceilingFt: 4200,
            flightCategory: 'VFR',
            raw: 'METAR EGCC 110820Z 26006KT 9999 SCT042 16/14 Q1018',
            summary: 'Clear and unrestricted',
          },
        });
      }
      throw new Error(`unexpected request: ${url}`);
    }),
  );
}

beforeEach(() => {
  clearAll();
  resetHttpState();
  aircraftLatitude = 54.6;
  scheduledFlights = [];
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
    // The hour in Manchester, like the date — not the machine's own zone. CI
    // runs in UTC, and mixing the two once put the flight a day away.
    fireEvent.change(screen.getByLabelText(/Flight arrival time/i), {
      target: { value: `${formatClock(arrival.getTime(), MANCHESTER.timeZone).slice(0, 2)}:00` },
    });
    await user.type(screen.getByLabelText(/Flight number/i), 'KL1038');
    await user.type(screen.getByLabelText(/Starting postcode/i), 'M1 4BT');
    await user.click(screen.getByRole('radio', { name: /Quick pickup/i }));

    // 3. Calculate.
    await user.click(screen.getByRole('button', { name: /Calculate when to leave/i }));

    const recommendation = await screen.findByRole('region', { name: /Set off at/i }, { timeout: 5000 });
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
    // Just checked, so the manual check is in its cooldown rather than
    // inviting a press that could achieve nothing.
    expect(await screen.findByRole('button', { name: /Check again in \d+s/i })).toBeDisabled();

    // 5. The flight moves: the aircraft is now much further out, so it will
    //    arrive later and the driver should leave later. Only a deliberate
    //    check bypasses the snapshot cache, so wait out the cooldown.
    aircraftLatitude = 57.4;
    const checkNow = await screen.findByRole(
      'button',
      { name: /Check now/i },
      { timeout: (CHECK_COOLDOWN_SECONDS + 5) * 1000 },
    );
    await user.click(checkNow);

    // 6. The user is told what changed, and the recommendation really moved.
    const notice = await screen.findByText(/Your departure time changed/i, undefined, {
      timeout: 5000,
    });
    expect(notice).toBeInTheDocument();
    expect((await screen.findAllByText(/minutes later/i)).length).toBeGreaterThan(0);

    const updated = screen.getByRole('region', { name: /Set off at/i });
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
    expect(screen.queryByRole('region', { name: /Set off at/i })).not.toBeInTheDocument();
  }, 30_000);
});

describe('utterance to the real planner', () => {
  it('plans from a sentence, accepts a correction, explains and starts monitoring without saving the transcript', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/pickup';
    render(<App />);
    const instruction = await screen.findByLabelText('Or type an instruction');
    await user.type(instruction, 'landing tomorrow at 18:30, flight KL1038');
    await user.click(screen.getByRole('button', { name: 'Use instruction' }));
    await screen.findByText(/Enter your starting postcode below/);
    await user.type(screen.getByLabelText('Voice starting postcode'), 'M1 4BT');
    await user.click(screen.getByRole('button', { name: 'Calculate understood journey' }));
    const first = await screen.findByRole('region', { name: /Set off at/ }, { timeout: 5000 });
    const firstTime = within(first).getByText(/^\d{2}:\d{2}$/).textContent;
    expect(screen.getByLabelText('Voice flight time')).toHaveValue('18:30');
    await user.type(instruction, 'no, 19:00');
    await user.click(screen.getByRole('button', { name: 'Use instruction' }));
    const corrected = await screen.findByRole('region', { name: /Set off at/ }, { timeout: 5000 });
    expect(screen.getByLabelText('Voice flight time')).toHaveValue('19:00');
    expect(within(corrected).getByText(/^\d{2}:\d{2}$/).textContent).not.toBe(firstTime);
    await user.type(instruction, 'why that time?');
    await user.click(screen.getByRole('button', { name: 'Use instruction' }));
    await screen.findAllByText(/Leaving at .* should get you to Manchester Airport/);
    await user.type(instruction, 'start monitoring');
    await user.click(screen.getByRole('button', { name: 'Use instruction' }));
    expect(await screen.findByRole('button', { name: /Check again in/ })).toBeDisabled();
    const stored = listKeys().map(key => readRaw(key)).join(' ');
    expect(stored).not.toContain('landing tomorrow at');
    expect(stored).not.toContain('why that time');
    expect(stored).toContain('KL1038');
  }, 15000);


  it('shows the correct journey heading when voice switches a pickup page to drop-off', async () => {
    const user = userEvent.setup(); window.location.hash = '#/pickup'; render(<App />);
    await user.type(await screen.findByLabelText('Or type an instruction'), 'drop off tomorrow at 19:00 postcode M1 4BT');
    await user.click(screen.getByRole('button', { name: 'Use instruction' }));
    await screen.findByRole('region', { name: /Set off at/ }, { timeout: 5000 });
    expect(screen.getByRole('heading', { name: 'Plan a drop-off', level: 1 })).toBeInTheDocument();
    expect(screen.getByLabelText('Voice journey type')).toHaveValue('dropoff');
  }, 10000);

  it('does not calculate an ambiguous pickup until AM/PM and landing basis are settled', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/pickup';
    render(<App />);
    await user.type(await screen.findByLabelText('Or type an instruction'), 'I am picking someone up at 6:30 tomorrow, Ryanair from Rabat');
    await user.click(screen.getByRole('button', { name: 'Use instruction' }));
    expect(await screen.findByText('Is that AM or PM?')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /Set off at/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'PM' }));
    expect(screen.getByLabelText('Voice flight time')).toHaveValue('18:30');
    await user.type(screen.getByLabelText('Voice starting postcode'), 'M1 4BT');
    await user.click(screen.getByRole('button', { name: 'That is the landing time' }));
    await screen.findByRole('region', { name: /Set off at/ }, { timeout: 5000 });
    expect(screen.getByText(/No matching flight in the available data/)).toBeInTheDocument();
  }, 15000);
});


describe('voice flight choices from published data', () => {
  const fixture = (flight: string, status: ScheduledFlight['status'] = 'scheduled'): ScheduledFlight => {
    const date = todayInZone(Date.now() + 86400000, MANCHESTER.timeZone);
    const at = parseLocalDateTime(date, '18:30', MANCHESTER.timeZone)!;
    return { flight, callsign: 'RYR123', airline: 'FR', otherEnd: { icao: 'GMME', iata: 'RBA', city: 'Rabat', country: 'MA' }, scheduled: at, estimated: null, actual: null, status, delayMinutes: null, terminal: '3', aliases: [] };
  };
  it('requires a choice for multiple matches, then uses the chosen flight in the real planner', async () => {
    scheduledFlights = [fixture('FR123'), fixture('FR124')];
    const user = userEvent.setup(); window.location.hash = '#/pickup'; render(<App />);
    await user.type(await screen.findByLabelText('Or type an instruction'), 'landing tomorrow at 18:30, Ryanair from Rabat');
    await user.click(screen.getByRole('button', { name: 'Use instruction' }));
    await screen.findByText(/I found 2 possible flights/);
    expect(screen.queryByRole('region', { name: /Set off at/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Option 2: FR124/ }));
    await screen.findByText(/Enter your starting postcode below/);
    await user.type(screen.getByLabelText('Voice starting postcode'), 'M1 4BT');
    await user.click(screen.getByRole('button', { name: 'Calculate understood journey' }));
    await screen.findByRole('region', { name: /Set off at/ }, { timeout: 5000 });
    expect(screen.getByLabelText('Voice flight number')).toHaveValue('FR124');
  }, 10000);
  it('does not recommend or monitor a matched cancelled flight', async () => {
    scheduledFlights = [fixture('FR123', 'cancelled')];
    const user = userEvent.setup(); window.location.hash = '#/pickup'; render(<App />);
    await user.type(await screen.findByLabelText('Or type an instruction'), 'landing tomorrow at 18:30, Ryanair from Rabat, postcode M1 4BT');
    await user.click(screen.getByRole('button', { name: 'Use instruction' }));
    await screen.findAllByText(/This flight is showing as cancelled/, undefined, { timeout: 5000 });
    expect(screen.queryByRole('region', { name: /Set off at/ })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Or type an instruction'), 'start monitoring');
    await user.click(screen.getByRole('button', { name: 'Use instruction' }));
    expect(await screen.findByText(/Calculate a current recommendation first/)).toBeInTheDocument();
  }, 10000);
  it('corrects from a domestic flight to an international one without retaining the old terminal', async () => {
    scheduledFlights = [
      { ...fixture('BA123'), callsign: 'BAW123', airline: 'BA', otherEnd: { icao: 'EGLL', iata: 'LHR', city: 'London', country: 'GB' }, terminal: '1' },
      fixture('FR456'),
    ];
    const user = userEvent.setup(); window.location.hash = '#/pickup'; render(<App />);
    const instruction = await screen.findByLabelText('Or type an instruction');
    await user.type(instruction, 'landing tomorrow at 18:30 flight BA123 postcode M1 4BT');
    await user.click(screen.getByRole('button', { name: 'Use instruction' }));
    await screen.findByRole('region', { name: /Set off at/ }, { timeout: 5000 });
    expect(screen.getByLabelText('Route', { exact: true })).toHaveValue('domestic');
    expect(screen.getByLabelText('Terminal', { exact: true })).toHaveValue('T1');
    await user.type(instruction, 'actually flight FR456');
    await user.click(screen.getByRole('button', { name: 'Use instruction' }));
    await screen.findByRole('region', { name: /Set off at/ }, { timeout: 5000 });
    expect(screen.getByLabelText('Route', { exact: true })).toHaveValue('international');
    expect(screen.getByLabelText('Terminal', { exact: true })).toHaveValue('T3');
    expect(screen.getByLabelText('Voice flight number')).toHaveValue('FR456');
  }, 10000);

});
