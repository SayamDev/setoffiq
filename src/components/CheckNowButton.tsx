import { useEffect, useState } from 'react';
import type { Instant } from '../domain/types';
import { Button } from './ui';

/**
 * "Check now", with a short cooldown.
 *
 * A deliberate check is worth having — it bypasses the snapshot cache — but
 * holding the button down is pointless: the data behind it is republished
 * every fifteen minutes, and every request lands on services given away for
 * free. So the button says when it can next be useful rather than pretending
 * each press achieves something.
 */
export const CHECK_COOLDOWN_SECONDS = 15;

export function CheckNowButton({
  onCheck,
  checking,
  lastCheckedAt,
}: {
  onCheck: () => void;
  checking: boolean;
  lastCheckedAt: Instant | null;
}): React.JSX.Element {
  const [remaining, setRemaining] = useState(() => secondsLeft(lastCheckedAt));

  useEffect(() => {
    setRemaining(secondsLeft(lastCheckedAt));
    if (lastCheckedAt === null) return;
    // Ticks only while the cooldown is running, not for the life of the page.
    const timer = setInterval(() => {
      const left = secondsLeft(lastCheckedAt);
      setRemaining(left);
      if (left === 0) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [lastCheckedAt]);

  const waiting = remaining > 0;
  return (
    <Button variant="secondary" onClick={onCheck} disabled={checking || waiting}>
      {checking ? 'Checking…' : waiting ? `Check again in ${remaining}s` : 'Check now'}
    </Button>
  );
}

function secondsLeft(lastCheckedAt: Instant | null): number {
  if (lastCheckedAt === null) return 0;
  const elapsed = (Date.now() - lastCheckedAt) / 1000;
  return Math.max(0, Math.ceil(CHECK_COOLDOWN_SECONDS - elapsed));
}
