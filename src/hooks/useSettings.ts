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

  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'system') {
      // No attribute at all, so the OS preference applies through the media
      // query rather than being overridden by an explicit value.
      delete root.dataset['theme'];
    } else {
      root.dataset['theme'] = settings.theme;
    }
  }, [settings.theme]);

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
