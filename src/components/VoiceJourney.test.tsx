import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VoiceJourney } from './VoiceJourney';
import type { Recognition } from '../services/voice/speech';
import { loadVoiceFlights } from '../services/voice/journey';
vi.mock('../services/voice/journey', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/voice/journey')>()),
  loadVoiceFlights: vi.fn(async () => []),
}));
class FakeRecognition implements Recognition {
  static instances: FakeRecognition[] = [];
  lang = '';
  continuous = false;
  interimResults = false;
  aborted = false;
  onresult: Recognition['onresult'] = null;
  onerror: Recognition['onerror'] = null;
  onend: Recognition['onend'] = null;
  onstart: Recognition['onstart'] = null;
  constructor() {
    FakeRecognition.instances.push(this);
  }
  start() {
    this.onstart?.();
  }
  abort() {
    this.aborted = true;
  }
}
function setup() {
  vi.stubGlobal('SpeechRecognition', FakeRecognition);
  const onInput = vi.fn();
  const onMonitor = vi.fn();
  const result = render(
    <VoiceJourney
      kind="pickup"
      input={null}
      plan={null}
      busy={false}
      error={null}
      onInput={onInput}
      onMonitor={onMonitor}
    />,
  );
  return { ...result, onInput, onMonitor };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.mocked(loadVoiceFlights).mockResolvedValue([]);
  FakeRecognition.instances = [];
});
describe('voice controls and cancellation', () => {
  it('stops when hidden and requires a new tap when returning', async () => {
    setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Listen' }));
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    fireEvent(document, new Event('visibilitychange'));
    expect(FakeRecognition.instances[0]!.aborted).toBe(true);
    expect(
      screen.getByText(/Voice paused while the screen was locked/),
    ).toBeInTheDocument();
    hidden.mockReturnValue(false);
    fireEvent(document, new Event('visibilitychange'));
    expect(FakeRecognition.instances).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Listen' }));
    expect(FakeRecognition.instances).toHaveLength(2);
  });
  it('stops with Escape and releases recognition on unmount', async () => {
    const { unmount } = setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Listen' }));
    await user.keyboard('{Escape}');
    expect(FakeRecognition.instances[0]!.aborted).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Listen' }));
    unmount();
    expect(FakeRecognition.instances[1]!.aborted).toBe(true);
  });
  it('keeps an obsolete flight lookup from replacing a newer correction', async () => {
    let resolve: (flights: []) => void = () => {};
    vi.mocked(loadVoiceFlights).mockImplementationOnce(
      () =>
        new Promise<[]>((done) => {
          resolve = done;
        }),
    );
    const { onInput } = setup();
    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText('Or type an instruction'),
      'landing tomorrow at 18:30, Ryanair from Rabat',
    );
    await user.click(screen.getByRole('button', { name: 'Use instruction' }));
    await user.type(
      screen.getByLabelText('Or type an instruction'),
      'actually 19:00',
    );
    await user.click(screen.getByRole('button', { name: 'Use instruction' }));
    await screen.findByText(/Enter your starting postcode below/);
    resolve([]);
    expect(screen.getByLabelText('Voice flight time')).toHaveValue('19:00');
    expect(onInput.mock.calls.every((call) => call[0] === null)).toBe(true);
  });
  it('keeps AM/PM pending when another journey detail arrives', async () => {
    const { onInput } = setup();
    const user = userEvent.setup();
    const instruction = screen.getByLabelText('Or type an instruction');
    await user.type(instruction, 'landing tomorrow at half six');
    await user.click(screen.getByRole('button', { name: 'Use instruction' }));
    expect(screen.getByText('Is that AM or PM?')).toBeInTheDocument();
    await user.type(instruction, 'postcode M1 4BT');
    await user.click(screen.getByRole('button', { name: 'Use instruction' }));
    expect(screen.getByText('Is that AM or PM?')).toBeInTheDocument();
    expect(onInput.mock.calls.every((call) => call[0] === null)).toBe(true);
  });
});
