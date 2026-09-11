import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from '../storage/settings';

export function useSettings(): {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  reset: () => void;
} {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());

  useEffect(() => {
    document.documentElement.dataset['reducedMotion'] = String(settings.reducedMotion);
  }, [settings.reducedMotion]);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    saveSettings(DEFAULT_SETTINGS);
  }, []);

  return { settings, update, reset };
}
