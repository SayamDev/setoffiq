import { useEffect, useSyncExternalStore } from 'react';
import {
  disableNatural,
  naturalState,
  prepareNaturalAutomatically,
  subscribeNatural,
} from '../services/voice/natural';
import styles from './WelcomeGuide.module.css';

/** Once per app mount, after the first paint. No microphone or audio autoplay. */
export function VoicePreparation(): React.JSX.Element | null {
  const state = useSyncExternalStore(subscribeNatural, naturalState);
  useEffect(() => {
    const prepare = () => {
      if (!document.hidden) void prepareNaturalAutomatically().catch(() => {});
    };
    const timer = setTimeout(prepare, 1200);
    document.addEventListener('visibilitychange', prepare);
    window.addEventListener('online', prepare);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', prepare);
      window.removeEventListener('online', prepare);
    };
  }, []);
  if (state.status === 'ready' || (!state.message && state.status === 'idle'))
    return null;
  return (
    <aside className={styles.download} aria-label="Natural voice preparation">
      <div>
        <strong>
          {state.status === 'loading'
            ? 'Preparing your natural voice'
            : 'Device voice available'}
        </strong>
        <p role="status">{state.message}</p>
        {state.status === 'loading' ? (
          <details>
            <summary>Download size and privacy</summary>
            <p>
              One-time download: about 115–350 MB + 22 MB runtime from Hugging
              Face. They receive your IP, not journey text. Keep planning while
              it loads.
            </p>
          </details>
        ) : null}
      </div>
      {state.status === 'loading' ? (
        <button type="button" onClick={disableNatural}>
          Use device voice
        </button>
      ) : null}
    </aside>
  );
}
