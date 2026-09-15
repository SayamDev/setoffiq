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

    await user.click(screen.getByRole('button', { name: /Collecting someone from a flight/ }));
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

describe('required-field validation', () => {
  it('lets each summary issue move focus to the field that needs attention', async () => {
    const user = userEvent.setup();
    render(<JourneyForm kind="pickup" airport={MANCHESTER} now={Date.now()} onSubmit={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '' } });
    await user.click(screen.getByRole('button', { name: /Calculate my journey/i }));

    await user.click(screen.getByRole('button', { name: 'Choose the date of the flight.' }));
    expect(screen.getByLabelText('Date')).toHaveFocus();

    await user.click(
      screen.getByRole('button', { name: 'Enter the arrival time from the booking.' }),
    );
    expect(screen.getByLabelText('Scheduled arrival time')).toHaveFocus();

    await user.click(
      screen.getByRole('button', { name: 'Enter the UK postcode you are setting off from.' }),
    );
    expect(screen.getByLabelText('Setting off from')).toHaveFocus();
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

describe('planning a drop-off from a flight that usually leaves soon', () => {
  afterEach(() => clearAll());

  it('fills in the usual take-off, less the time from the gate', async () => {
    const now = Date.now();
    const london = (offsetMinutes: number) => {
      const at = new Date(now + offsetMinutes * 60_000);
      const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at);
      const get = (type: string) => parts.find((p) => p.type === type)!.value;
      return { date: `${get('year')}-${get('month')}-${get('day')}`, minute: Number(get('hour')) * 60 + Number(get('minute')) };
    };
    // Usually takes off three hours from now.
    const usual = london(180);
    const past = (days: number) => {
      const d = new Date(`${london(0).date}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() - days);
      return d.toISOString().slice(0, 10);
    };
    writeCache(
      'arrival-history:EGCC',
      {
        generatedAt: new Date(now).toISOString(),
        recordingSince: past(10),
        departuresSince: past(10),
        keepDays: 14,
        flights: {},
        departures: {
          EZY256Q: { to: { icao: 'EGAA', city: 'Belfast', country: 'GB' }, landings: [1, 2, 3].map((d) => ({ date: past(d), minute: usual.minute })) },
        },
      },
      now,
    );
    const user = userEvent.setup();
    render(<JourneyForm kind="dropoff" airport={MANCHESTER} now={now} onSubmit={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Dropping someone off for a flight/ }));
    await user.click(await screen.findByRole('button', { name: /EZY256Q.*easyJet.*to Belfast/s }));

    const gate = london(160);
    const expected = `${String(Math.floor(gate.minute / 60)).padStart(2, '0')}:${String(gate.minute % 60).padStart(2, '0')}`;
    expect(screen.getByLabelText('Scheduled departure time')).toHaveValue(expected);
    expect(screen.getByRole('radio', { name: /Within the UK/ })).toBeChecked();
    expect(screen.getByText(/less 20 minutes from the gate/)).toBeInTheDocument();
  });
});


describe('choosing from the airline schedule', () => {
  afterEach(() => clearAll());

  const clock = (ms: number) =>
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms));

  function seedSchedule(now: number) {
    const base = { callsign: null, airline: null, actual: null, terminal: null, aliases: [] as string[] };
    writeCache(
      'flight-snapshot:EGCC',
      { generatedAt: new Date(now).toISOString(), airportIcao: 'EGCC', source: 't', attribution: 't', radiusKm: 463, aircraft: [] } as FlightSnapshot,
      now,
    );
    writeCache(
      'flight-schedule:EGCC',
      {
        generatedAt: new Date(now).toISOString(),
        attribution: 'Flight schedules from AirLabs (airlabs.co)',
        arrivals: [
          { ...base, flight: 'FR3006', callsign: 'RYR3006', otherEnd: { icao: 'LEIB', iata: 'IBZ', city: 'Ibiza', country: 'ES' }, scheduled: now + 2 * 3_600_000, estimated: null, status: 'cancelled', delayMinutes: null },
          { ...base, flight: 'EK19', callsign: 'UAE19', otherEnd: { icao: 'OMDB', iata: 'DXB', city: 'Dubai', country: 'AE' }, scheduled: now + 3 * 3_600_000, estimated: now + 3 * 3_600_000 + 25 * 60_000, status: 'active', delayMinutes: 25 },
        ],
        departures: [
          { ...base, flight: 'LS811', callsign: 'EXS811', otherEnd: { icao: 'LEAL', iata: 'ALC', city: 'Alicante', country: 'ES' }, scheduled: now + 4 * 3_600_000, estimated: null, status: 'scheduled', delayMinutes: null },
        ],
      },
      now,
    );
  }

  it('lists arrivals with their state, and a pick fills in the booking time', async () => {
    const now = Date.now();
    seedSchedule(now);
    const user = userEvent.setup();
    render(<JourneyForm kind="pickup" airport={MANCHESTER} now={now} onSubmit={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Collecting someone from a flight/ }));
    expect(await screen.findByRole('button', { name: /FR3006.*Ryanair.*from Ibiza.*Cancelled/s })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /EK19.*Emirates.*from Dubai.*Delayed ~25 min/s }));

    expect(screen.getByLabelText('Flight number (optional)')).toHaveValue('EK19');
    expect(screen.getByLabelText('Scheduled arrival time')).toHaveValue(clock(now + 3 * 3_600_000));
    expect(screen.getByRole('status')).toHaveTextContent(/running about 25 minutes late/);
    expect(screen.getByText(/Filled in from the airline schedule/)).toBeInTheDocument();
  });

  it('fills a drop-off with the scheduled departure itself — the gate time, no allowance', async () => {
    const now = Date.now();
    seedSchedule(now);
    const user = userEvent.setup();
    render(<JourneyForm kind="dropoff" airport={MANCHESTER} now={now} onSubmit={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Dropping someone off for a flight/ }));
    await user.click(await screen.findByRole('button', { name: /LS811.*Jet2.*to Alicante/s }));

    expect(screen.getByLabelText('Scheduled departure time')).toHaveValue(clock(now + 4 * 3_600_000));
    expect(screen.getByRole('radio', { name: /International/ })).toBeChecked();
  });
});


describe('the timetable, when the schedule has nothing to say', () => {
  afterEach(() => clearAll());

  const clock = (ms: number) =>
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms));

  /** A flight timetabled to land three hours from now, and nothing else. */
  function seedTimetable(now: number) {
    const durationMinutes = 120;
    const departure = new Date(now + 3 * 3_600_000 - durationMinutes * 60_000);
    const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    writeCache(
      'flight-timetable:EGCC',
      {
        generatedAt: new Date(now).toISOString(),
        attribution: 'Flight schedules from AirLabs (airlabs.co)',
        arrivals: [
          {
            flight: 'EK21',
            callsign: 'UAE21',
            airline: 'EK',
            otherEnd: { icao: 'OMDB', iata: 'DXB', city: 'Dubai', country: 'AE' },
            days: [days[departure.getUTCDay()]],
            departureMinute: departure.getUTCHours() * 60 + departure.getUTCMinutes(),
            durationMinutes,
            terminal: '2',
            aliases: [],
          },
        ],
        departures: [],
      },
      now,
    );
  }

  it('lists a timetabled arrival when there is no schedule at all, and fills the time in', async () => {
    const now = Date.now();
    seedTimetable(now);
    const user = userEvent.setup();
    render(<JourneyForm kind="pickup" airport={MANCHESTER} now={now} onSubmit={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Collecting someone from a flight/ }));
    await user.click(await screen.findByRole('button', { name: /EK21.*Emirates.*from Dubai/s }));

    expect(screen.getByLabelText('Flight number (optional)')).toHaveValue('EK21');
    expect(screen.getByLabelText('Scheduled arrival time')).toHaveValue(clock(now + 3 * 3_600_000));
    // The timetable carries no status, and the interface has to say so.
    expect(screen.getByText(/published timetable, which carries no status/)).toBeInTheDocument();
  });

  it('filters a long list down to one flight', async () => {
    const now = Date.now();
    seedTimetable(now);
    const user = userEvent.setup();
    render(<JourneyForm kind="pickup" airport={MANCHESTER} now={now} onSubmit={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Collecting someone from a flight/ }));
    await screen.findByRole('button', { name: /EK21/ });
    await user.type(screen.getByLabelText('Find a flight'), 'BA 1360');

    expect(screen.queryByRole('button', { name: /EK21/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Nothing matches/)).toBeInTheDocument();
  });
});
