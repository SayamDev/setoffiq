import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { BookingTimeEditor } from './BookingTimeEditor';
import { createJourney, loadJourneys, saveJourneys } from '../storage/journeys';
import { bookingTime } from '../services/bookingTime';
import { clearAll } from '../services/storage';

const now = Date.parse('2026-10-20T12:00:00Z');
const journey = () => createJourney('RK1712 from Rabat · Wed 21 Oct', {
  kind: 'pickup', airportIata: 'MAN', flightNumber: 'RK1712', scheduledTime: Date.parse('2026-10-21T14:25:00Z'),
  passengerRoute: 'international', terminalCode: 'T3', origin: { latitude: 53.48, longitude: -2.24, label: 'Manchester' },
  pickupMode: 'short-stay', dropoffMode: null, scenarioId: null,
}, now);

afterEach(() => { vi.useRealTimers(); clearAll(); });

describe('booking time and timezone trust', () => {
  it.each([
    ['2026-10-21', '14:25', '2026-10-21T13:25:00Z'],
    ['2026-10-28', '14:25', '2026-10-28T14:25:00Z'],
  ])('interprets %s %s as Manchester local time', (date, clock, expected) => {
    expect(bookingTime('pickup', date, clock, 'Europe/London', now)).toBe(Date.parse(expected));
  });
  it.each([['2026-03-29', '01:30'], ['2026-10-25', '01:30'], ['2026-02-30', '14:25'], ['', ''], ['2026-10-21', '25:00']])('rejects invalid or ambiguous clock %s %s', (date, clock) => {
    expect(typeof bookingTime('pickup', date, clock, 'Europe/London', Date.parse('2026-01-01T00:00:00Z'))).toBe('string');
  });
  it('corrects 15:25 to the booking’s 14:25 while preserving the saved journey and history', () => {
    vi.useFakeTimers(); vi.setSystemTime(now);
    const original = journey();
    const onSave = vi.fn();
    render(<BookingTimeEditor journey={original} onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: 'Correct flight time' }));
    fireEvent.change(screen.getByLabelText('Booking time at Manchester'), { target: { value: '14:25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use booking time' }));
    const corrected = onSave.mock.calls[0]![0];
    expect(corrected.input.scheduledTime).toBe(Date.parse('2026-10-21T13:25:00Z'));
    expect(corrected.id).toBe(original.id);
    expect(corrected.monitoring).toBe('active');
    expect(corrected.events).toHaveLength(2);
    expect(corrected.events[1].message).toContain('15:25 to 14:25');
    saveJourneys([corrected]);
    expect(loadJourneys()[0]?.input.scheduledTime).toBe(corrected.input.scheduledTime);
    expect(screen.getByRole('status')).toHaveTextContent('Recalculating');
    expect(screen.getByRole('button', { name: 'Correct flight time' })).toHaveFocus();
  });
  it('cancels with Escape without modifying the journey', () => {
    const onSave = vi.fn();
    render(<BookingTimeEditor journey={journey()} onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: 'Correct flight time' }));
    fireEvent.keyDown(screen.getByLabelText('Booking time at Manchester'), { key: 'Escape' });
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Use booking time' })).not.toBeInTheDocument();
  });
});
