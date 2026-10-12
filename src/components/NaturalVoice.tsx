import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  disableNatural,
  enableNatural,
  naturalEnabled,
  prepareNaturalAutomatically,
  naturalState,
  removeNatural,
  subscribeNatural,
} from '../services/voice/natural';
import { Button, ui } from './ui';
import styles from './VoiceJourney.module.css';
export function NaturalVoice({
  onPreview,
  onStop,
}: {
  onPreview(): void;
  onStop(): void;
}): React.JSX.Element {
  const state = useSyncExternalStore(subscribeNatural, naturalState);
  const enabled = naturalEnabled();
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    if (naturalEnabled())
      void prepareNaturalAutomatically().catch(() => {
        if (active && naturalEnabled() && naturalState().status === 'error')
          setError(
            'The natural voice could not load. Use the device voice or retry.',
          );
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <details>
      <summary className={styles.summary}>
        Voice settings · {enabled ? 'natural British voice' : 'device voice'}
      </summary>
      <p className={ui.hint}>
        SetoffIQ prepares Kokoro automatically unless you choose the device voice (roughly 115 MB on CPU or 350
        MB with GPU acceleration, plus a 22 MB speech runtime). It speaks on
        your device, without sending your replies to a server. The first
        download and warm-up can take a few minutes. It may be slow on older
        phones. Downloads come from Hugging Face; they see your IP and file
        requests, not your journey text.
      </p>
      <div className={styles.actions}>
        {!enabled || state.status === 'error' ? (
          <Button
            variant="secondary"
            onClick={() => {
              onStop();
              setError('');
              void enableNatural().catch(() => {
                if (naturalEnabled())
                  setError(
                    'The natural voice could not load. Use the device voice or try again.',
                  );
              });
            }}
          >
            Download natural voice
          </Button>
        ) : null}
        {enabled ? (
          <Button
            variant="secondary"
            onClick={() => {
              onStop();
              disableNatural();
              setError('');
            }}
          >
            Use device voice
          </Button>
        ) : null}
        {state.status === 'ready' ? (
          <Button variant="quiet" onClick={onPreview}>
            Try natural voice
          </Button>
        ) : null}
        <Button
          variant="quiet"
          onClick={() => {
            onStop();
            setError('');
            void removeNatural().catch(() =>
              setError(
                'Could not remove downloaded files. Use your browser’s site storage controls.',
              ),
            );
          }}
        >
          Remove voice download
        </Button>
      </div>
      <p role="status" className={ui.hint}>
        {error ||
          state.message ||
          'Device voices vary by browser. Only voices marked local are used.'}
      </p>
      <p className={ui.hint}>
        Your choice is remembered. After reopening the app, the voice reloads
        from cached files if available. Until ready, or if audio fails, replies
        use a local device voice. If neither works, the answer stays on screen.
      </p>
    </details>
  );
}
