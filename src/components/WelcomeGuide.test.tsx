import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it } from 'vitest';
import { WelcomeGuide } from './WelcomeGuide';
import { clearAll, readRaw, writeRaw } from '../services/storage';
beforeEach(clearAll);
it('shows a skippable first visit guide, remembers dismissal, and reopens from Help', async () => {
  const user = userEvent.setup();
  const view = render(<WelcomeGuide />);
  expect(await screen.findByRole('dialog')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Skip guide' }));
  expect(readRaw('welcome-seen-v1')).toBe('true');
  view.unmount();
  render(<WelcomeGuide />);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'How to use SetoffIQ' }));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  fireEvent(
    screen.getByRole('dialog'),
    new Event('cancel', { cancelable: true }),
  );
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
it('runs the example correction through the real parser without saving the example', async () => {
  writeRaw('welcome-seen-v1', 'true');
  const user = userEvent.setup();
  render(<WelcomeGuide />);
  await user.click(screen.getByRole('button', { name: 'How to use SetoffIQ' }));
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  await user.click(screen.getByRole('button', { name: 'No, 7 PM' }));
  expect(screen.getByText('19:00')).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent(
    'example flight time has changed',
  );
  await user.clear(screen.getByLabelText('Try correcting this example'));
  await user.type(
    screen.getByLabelText('Try correcting this example'),
    'book a taxi',
  );
  await user.click(screen.getByRole('button', { name: 'Try correction' }));
  expect(screen.getByRole('status')).toHaveTextContent('cannot book');
  expect(screen.getByText('19:00')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  await user.click(screen.getByRole('button', { name: 'Let’s plan' }));
  expect(JSON.stringify(localStorage)).not.toContain('book a taxi');
});
