import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { FlightTracking } from './FlightTracking';
import { createJourney } from '../storage/journeys';
import type { FlightStatus, Observed } from '../domain/types';
const now = Date.parse('2026-10-21T12:00:00Z');
const journey = createJourney('RK1712', { kind: 'pickup', airportIata: 'MAN', flightNumber: 'RK1712', scheduledTime: Date.parse('2026-10-21T13:25:00Z'), passengerRoute: 'international', terminalCode: 'T3', origin: { latitude: 53.48, longitude: -2.24, label: 'Manchester' }, pickupMode: 'short-stay', dropoffMode: null, scenarioId: null }, now);
it('shows the booking and does not label it as a new aircraft estimate', () => {
  render(<FlightTracking journey={journey} flight={null} now={now} onSave={vi.fn()} />);
  expect(screen.getByText('14:25')).toBeInTheDocument();
  expect(screen.getByText('Awaiting flight data')).toBeInTheDocument();
});
it('requires a valid user-linked callsign and preserves booking identity and clock', () => {
  const save = vi.fn();
  render(<FlightTracking journey={journey} flight={null} now={now} onSave={save} />);
  fireEvent.click(screen.getByRole('button', { name: 'Link aircraft callsign' }));
  const input = screen.getByLabelText(/Aircraft callsign for RK1712/);
  fireEvent.change(input, { target: { value: 'RK1712' } });
  fireEvent.click(screen.getByRole('button', { name: 'Link this aircraft' }));
  expect(save).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toBeInTheDocument();
  fireEvent.change(input, { target: { value: 'ruk87al' } });
  fireEvent.click(screen.getByRole('button', { name: 'Link this aircraft' }));
  expect(save.mock.calls[0]![0].input).toEqual({ ...journey.input, trackingCallsign: 'RUK87AL' });
  expect(save.mock.calls[0]![0].id).toBe(journey.id);
});
it('labels old estimates and their actual observation time without inventing improvement', () => {
  const flight: Observed<FlightStatus> = { state: 'stale', fetchedAt: now, observedAt: now, provider: 'test', attribution: null, message: null, value: { flightNumber: 'RK1712', callsign: 'RUK87AL', phase: 'airborne', scheduledArrival: journey.input.scheduledTime, scheduledDeparture: null, estimatedArrival: Date.parse('2026-10-21T13:05:00Z'), estimatedArrivalSource: 'live-position', position: null, observedAt: now - 35 * 60_000 } };
  render(<FlightTracking journey={journey} flight={flight} now={now} onSave={vi.fn()} />);
  expect(screen.getByText('14:05')).toBeInTheDocument();
  expect(screen.getByText('Estimated at stand · includes taxi')).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('12:25');
  expect(screen.getByRole('status')).toHaveTextContent('old; confidence is reduced');
});
