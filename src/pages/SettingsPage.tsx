import { useEffect, useState } from 'react';
import { DEFAULT_NOTIFICATION_THRESHOLD_MINUTES } from '../domain/assumptions';
import { Button, Callout, Card, Field, ui } from '../components/ui';
import { ollamaProvider } from '../services/ai';
import { clearAll } from '../services/storage';
import {
  notificationSupport,
  requestNotificationPermission,
  type NotificationPermissionState,
} from '../services/notifications';
import type { Settings } from '../storage/settings';
import styles from './PlanPage.module.css';

export function SettingsPage({
  settings,
  onUpdate,
  onClearJourneys,
}: {
  settings: Settings;
  onUpdate: (patch: Partial<Settings>) => void;
  onClearJourneys: () => void;
}): React.JSX.Element {
  const [permission, setPermission] = useState<NotificationPermissionState>(() =>
    notificationSupport(),
  );
  const [cleared, setCleared] = useState(false);
  /*
   * The published site has no model behind it, so for almost everyone this
   * option could never do anything. A control that cannot have an effect is
   * just a puzzle, so it appears only when a local model actually answers.
   */
  const [localModelFound, setLocalModelFound] = useState(false);

  useEffect(() => {
    let active = true;
    void ollamaProvider.isAvailable().then((available) => {
      if (active) setLocalModelFound(available);
    });
    return () => {
      active = false;
    };
  }, []);

  const enableNotifications = async (): Promise<void> => {
    const result = await requestNotificationPermission();
    setPermission(result);
    onUpdate({ notificationsEnabled: result === 'granted' });
  };

  const clearEverything = (): void => {
    onClearJourneys();
    clearAll();
    setCleared(true);
  };

  return (
    <>
      <header className={styles.header}>
        <h1 className={styles.title}>Settings</h1>
        <p className={styles.subtitle}>Everything here is stored in this browser only.</p>
      </header>

      <div className={styles.settingsGrid}>
        <Card>
        <h2>Notifications</h2>
        <p className={ui.hint}>
          SetoffIQ uses your browser's own notifications. There is no email or SMS, because both
          would mean paying a provider and handing over your details.
        </p>

        {permission === 'unsupported' ? (
          <Callout tone="info">
            <p>This browser does not support notifications. Everything else works as normal.</p>
          </Callout>
        ) : permission === 'granted' ? (
          <div className={ui.stackTight} style={{ marginTop: 'var(--space-4)' }}>
            <label className={ui.label}>
              <input
                type="checkbox"
                checked={settings.notificationsEnabled}
                onChange={(event) => onUpdate({ notificationsEnabled: event.target.checked })}
              />{' '}
              Notify me when a departure time changes meaningfully
            </label>
          </div>
        ) : permission === 'denied' ? (
          <Callout tone="warn">
            <p>
              Notifications are blocked for this site. You can re-enable them in your browser's site
              settings.
            </p>
          </Callout>
        ) : (
          <p style={{ marginTop: 'var(--space-4)' }}>
            <Button variant="secondary" onClick={enableNotifications}>
              Turn on notifications
            </Button>
          </p>
        )}

        <div style={{ marginTop: 'var(--space-5)' }}>
          <Field
            id="threshold"
            label="Only tell me when the departure time moves by at least"
            hint={`Smaller changes are recorded in the journey's activity log without interrupting you. Default is ${DEFAULT_NOTIFICATION_THRESHOLD_MINUTES} minutes.`}
          >
            <select
              id="threshold"
              className={ui.control}
              value={settings.notificationThresholdMinutes}
              onChange={(event) =>
                onUpdate({ notificationThresholdMinutes: Number(event.target.value) })
              }
            >
              {[5, 10, 15, 20, 30].map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes} minutes
                </option>
              ))}
            </select>
          </Field>
        </div>
        </Card>

      {localModelFound ? (
          <Card>
          <h2>Explanations</h2>
          <p className={ui.hint}>
            Every recommendation comes with a written explanation, built from the same figures
            SetoffIQ calculated. A local AI model is running on this machine, so it can write that
            explanation instead. It only changes the wording — every time and window stays exactly
            as calculated.
          </p>
          <label className={ui.label} style={{ marginTop: 'var(--space-4)', display: 'block' }}>
            <input
              type="checkbox"
              checked={settings.useLocalModel}
              onChange={(event) => onUpdate({ useLocalModel: event.target.checked })}
            />{' '}
            Let the local model write explanations
          </label>
          <p className={ui.hint} style={{ marginTop: 'var(--space-2)' }}>
            Nothing is sent over the internet — the model runs on this machine, and it is never
            given your postcode or address.
          </p>
          </Card>
      ) : null}

        <Card>
        <h2>Appearance</h2>
        <p className={ui.hint}>
          SetoffIQ follows your device's light or dark setting unless you choose otherwise.
        </p>
        <div className={ui.stackTight} style={{ marginTop: 'var(--space-4)' }}>
          {(['system', 'light', 'dark'] as const).map((choice) => (
            <label className={ui.label} key={choice}>
              <input
                type="radio"
                name="theme"
                value={choice}
                checked={settings.theme === choice}
                onChange={() => onUpdate({ theme: choice })}
              />{' '}
              {choice === 'system'
                ? "Match my device"
                : choice === 'light'
                  ? 'Always light'
                  : 'Always dark'}
            </label>
          ))}
        </div>
        </Card>

        <Card>
        <h2>Motion</h2>
        <label className={ui.label} style={{ display: 'block' }}>
          <input
            type="checkbox"
            checked={settings.reducedMotion}
            onChange={(event) => onUpdate({ reducedMotion: event.target.checked })}
          />{' '}
          Reduce motion
        </label>
        <p className={ui.hint} style={{ marginTop: 'var(--space-2)' }}>
          SetoffIQ already respects your system's reduced-motion setting. This forces it on
          regardless.
        </p>
        </Card>

        <Card>
        <h2>Your data</h2>
        <p className={ui.hint}>
          Saved journeys, cached routes and weather, your preferences and the local request counter
          all live in this browser. Clearing removes every one of them.
        </p>
        {cleared ? (
          <Callout tone="good" role="status">
            <p>All local SetoffIQ data has been cleared from this browser.</p>
          </Callout>
        ) : (
          <p style={{ marginTop: 'var(--space-4)' }}>
            <Button variant="danger" onClick={clearEverything}>
              Clear all local data
            </Button>
          </p>
        )}
        </Card>
      </div>
    </>
  );
}
