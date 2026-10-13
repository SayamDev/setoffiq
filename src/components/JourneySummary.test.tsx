import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { JourneySummary } from './JourneySummary';
const draft = {
  kind: 'pickup' as const,
  date: '2026-10-13',
  time: '18:30',
  postcode: 'M1 4BT',
  flightNumber: 'KL1038',
};
it('shows known details and opens a focused editor with a single tap', async () => {
  const user = userEvent.setup();
  const onApply = vi.fn();
  render(<JourneySummary draft={draft} onApply={onApply} />);
  await user.click(
    screen.getByRole('button', { name: 'Edit landing time: 18:30' }),
  );
  const time = screen.getByLabelText('New landing time');
  expect(time).toHaveFocus();
  await user.clear(time);
  await user.type(time, '19:00');
  await user.click(screen.getByRole('button', { name: 'Apply change' }));
  expect(onApply).toHaveBeenCalledWith({ time: '19:00' });
  expect(
    screen.getByRole('button', { name: 'Edit landing time: 18:30' }),
  ).toHaveFocus();
});
it('does not apply cancelled edits and normalises a manually edited flight number', async () => {
  const user = userEvent.setup();
  const onApply = vi.fn();
  render(<JourneySummary draft={draft} onApply={onApply} />);
  await user.click(
    screen.getByRole('button', { name: 'Edit flight number: KL1038' }),
  );
  const number = screen.getByLabelText('New flight number');
  await user.clear(number);
  await user.type(number, 'fr 123');
  await user.keyboard('{Escape}');
  expect(onApply).not.toHaveBeenCalled();
  await user.click(
    screen.getByRole('button', { name: 'Edit flight number: KL1038' }),
  );
  await user.clear(screen.getByLabelText('New flight number'));
  await user.type(screen.getByLabelText('New flight number'), 'fr 123');
  await user.click(screen.getByRole('button', { name: 'Apply change' }));
  expect(onApply).toHaveBeenCalledWith({ flightNumber: 'FR123' });
});
it('renders a missing date safely and requires a value before applying it', async () => {
  const user = userEvent.setup();
  const onApply = vi.fn();
  render(<JourneySummary draft={{ ...draft, date: '' }} onApply={onApply} />);
  await user.click(
    screen.getByRole('button', { name: 'Edit flight date: needed' }),
  );
  await user.click(screen.getByRole('button', { name: 'Apply change' }));
  expect(onApply).not.toHaveBeenCalled();
});
