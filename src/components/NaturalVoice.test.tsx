import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { NaturalVoice } from './NaturalVoice';
import { disableNatural } from '../services/voice/natural';
class WorkerStub {
  static instance: WorkerStub;
  onmessage: ((event: { data: { type: string } }) => void) | null = null;
  onerror: (() => void) | null = null;
  terminate = vi.fn();
  postMessage = vi.fn();
  constructor() {
    WorkerStub.instance = this;
  }
}
afterEach(() => {
  cleanup();
  disableNatural();
  localStorage.clear();
  vi.unstubAllGlobals();
});
function setup() {
  vi.stubGlobal('Worker', WorkerStub);
  const stop = vi.fn();
  const preview = vi.fn();
  render(<NaturalVoice onPreview={preview} onStop={stop} />);
  return { stop, preview, user: userEvent.setup() };
}
it('does not initialise or download a model for a user who has not opted in', () => {
  localStorage.clear();
  setup();
  expect(screen.getByText('Voice settings · device voice')).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Try natural voice' }),
  ).not.toBeInTheDocument();
});
it('cancelling a download switches back without reporting intentional cancellation as an error', async () => {
  const { user, stop } = setup();
  await user.click(screen.getByText('Voice settings · device voice'));
  await user.click(
    screen.getByRole('button', { name: 'Download natural voice' }),
  );
  expect(screen.getByText(/Loading the natural voice/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Use device voice' }));
  expect(stop).toHaveBeenCalledTimes(2);
  expect(WorkerStub.instance.terminate).toHaveBeenCalledOnce();
  expect(screen.getByText('Using the device voice.')).toBeInTheDocument();
  expect(screen.queryByText(/could not load/)).not.toBeInTheDocument();
});
it('restores the opted-in runtime on mounting and offers a microphone-free preview when ready', async () => {
  localStorage.setItem('setoffiq:natural-voice', 'true');
  const { user, preview } = setup();
  expect(WorkerStub.instance.postMessage).toHaveBeenCalledWith({
    type: 'load',
  });
  await user.click(screen.getByText('Voice settings · natural British voice'));
  await act(async () => {
    WorkerStub.instance.onmessage?.({ data: { type: 'ready' } });
  });
  await user.click(screen.getByRole('button', { name: 'Try natural voice' }));
  expect(preview).toHaveBeenCalledOnce();
});
