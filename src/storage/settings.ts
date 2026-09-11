import { DEFAULT_NOTIFICATION_THRESHOLD_MINUTES } from '../domain/assumptions';
import { readJson, writeJson } from '../services/storage';

/** `system` follows the operating system; the others override it. */
export type ThemeChoice = 'system' | 'light' | 'dark';

export interface Settings {
  theme: ThemeChoice;
  notificationsEnabled: boolean;
  /** How far a departure time must move before it is worth telling anyone. */
  notificationThresholdMinutes: number;
  /** Off by default: the public site has no model behind it. */
  useLocalModel: boolean;
  reducedMotion: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  notificationsEnabled: false,
  notificationThresholdMinutes: DEFAULT_NOTIFICATION_THRESHOLD_MINUTES,
  useLocalModel: false,
  reducedMotion: false,
};

const KEY = 'settings';

export function loadSettings(): Settings {
  return { ...DEFAULT_SETTINGS, ...readJson<Partial<Settings>>(KEY) };
}

export function saveSettings(settings: Settings): void {
  writeJson(KEY, settings);
}
