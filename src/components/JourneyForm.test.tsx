import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MANCHESTER } from '../domain/airports';
import { writeCache } from '../services/cache';
import { clearAll } from '../services/storage';
import type { FlightSnapshot, SnapshotAircraft } from '../services/flight/snapshotTypes';
import { JourneyForm } from './JourneyForm';

const place = (icao: string, city: string, country: string) => ({ icao, iata: null, city, name: null, country });

function inboundFromIbiza(): SnapshotAircraft {
  return {
    callsign: 'RYR61UR',
    icao24: '4ca123',
    latitude: 53.6,
    longitude: -2.4,
    baroAltitudeM: 3000,
    geoAltitudeM: 3050,
    groundSpeedMps: 150,
    verticalRateMps: -5,
    trueTrackDeg: 180,
    onGround: false,
    lastContact: Math.floor(Date.now() / 1000),
    route: { from: place('LEIB', 'Ibiza', 'ES'), to: place('EGCC', 'Manchester', 'GB') },
  };
}

describe('planning a pickup from an aircraft in the air', () => {
  afterEach(() => clearAll());

  it('fills in the flight, the date and the time from the aircraft picked', async () => {
    writeCache(
      'flight-snapshot:EGCC',
      { generatedAt: new Date().toISOString(), airportIcao: 'EGCC', source: 'test', attribution: 'test', radiusKm: 463, aircraft: [inboundFromIbiza()] } as FlightSnapshot,
      Date.now(),
    );
    const user = userEvent.setup();
    render(<JourneyForm kind="pickup" airport={MANCHESTER} now={Date.now()} onSubmit={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Collecting from a flight landing soon/ }));
    await user.click(await screen.findByRole('button', { name: /RYR61UR.*Ryanair.*from Ibiza/s }));

    expect(screen.getByLabelText('Flight number (optional)')).toHaveValue('RYR61UR');
    const time = screen.getByLabelText('Scheduled arrival time') as HTMLInputElement;
    expect(time.value).toMatch(/^\d\d:\d\d$/);
    // From Spain, so border control applies.
    expect(screen.getByRole('radio', { name: /International/ })).toBeChecked();
    expect(screen.getByRole('status')).toHaveTextContent(/Due on stand about/);
  });

  it('opens the native picker from anywhere in the date box, where the browser allows it', async () => {
    const showPicker = vi.fn();
    Object.defineProperty(HTMLInputElement.prototype, 'showPicker', { configurable: true, value: showPicker });
    const user = userEvent.setup();
    render(<JourneyForm kind="pickup" airport={MANCHESTER} now={Date.now()} onSubmit={vi.fn()} />);

    await user.click(screen.getByLabelText('Date'));
    await user.click(screen.getByLabelText('Scheduled arrival time'));
    expect(showPicker).toHaveBeenCalledTimes(2);
    Reflect.deleteProperty(HTMLInputElement.prototype, 'showPicker');
  });
});

describe('a time with no date chosen', () => {
  it('is taken as tomorrow once it has already passed today, and says so', () => {
    const at1900 = Date.UTC(2026, 8, 11, 18, 0);
    render(<JourneyForm kind="pickup" airport={MANCHESTER} now={at1900} onSubmit={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Scheduled arrival time'), { target: { value: '01:05' } });

    expect(screen.getByLabelText('Date')).toHaveValue('2026-09-12');
    expect(screen.getByText(/Taken as tomorrow, Sat 12 Sept, because 01:05 today has already passed/)).toBeInTheDocument();
  });

  it('never second-guesses a date someone chose', () => {
    const at1900 = Date.UTC(2026, 8, 11, 18, 0);
    render(<JourneyForm kind="pickup" airport={MANCHESTER} now={at1900} onSubmit={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-09-14' } });
    fireEvent.change(screen.getByLabelText('Scheduled arrival time'), { target: { value: '01:05' } });

    expect(screen.getByLabelText('Date')).toHaveValue('2026-09-14');
    expect(screen.queryByText(/Taken as tomorrow/)).not.toBeInTheDocument();
  });
});
