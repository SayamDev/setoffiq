/**
 * Every byte SetoffIQ persists goes through here, so "clear all local data"
 * in settings can genuinely clear everything and nothing writes to storage
 * behind the app's back. Storage can be unavailable (private browsing, a
 * blocked origin), so every call degrades to in-memory instead of throwing.
 */
const PREFIX = 'setoffiq:';

const memory = new Map<string, string>();

function backing(): Storage | null {
  try {
    const probe = '__setoffiq_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readRaw(key: string): string | null {
  const store = backing();
  if (!store) return memory.get(PREFIX + key) ?? null;
  try {
    return store.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

export function writeRaw(key: string, value: string): void {
  const store = backing();
  if (!store) {
    memory.set(PREFIX + key, value);
    return;
  }
  try {
    store.setItem(PREFIX + key, value);
  } catch {
    // Quota exceeded or storage disabled mid-session. Losing a cache entry is
    // not worth breaking a recommendation over.
    memory.set(PREFIX + key, value);
  }
}

export function removeRaw(key: string): void {
  memory.delete(PREFIX + key);
  const store = backing();
  if (!store) return;
  try {
    store.removeItem(PREFIX + key);
  } catch {
    /* nothing useful to do */
  }
}

export function readJson<T>(key: string): T | null {
  const raw = readRaw(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    removeRaw(key);
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  writeRaw(key, JSON.stringify(value));
}

/** Keys under the SetoffIQ namespace, without the prefix. */
export function listKeys(): string[] {
  const store = backing();
  const keys = new Set<string>();
  for (const key of memory.keys()) {
    if (key.startsWith(PREFIX)) keys.add(key.slice(PREFIX.length));
  }
  if (store) {
    try {
      for (let index = 0; index < store.length; index += 1) {
        const key = store.key(index);
        if (key?.startsWith(PREFIX)) keys.add(key.slice(PREFIX.length));
      }
    } catch {
      /* fall through to whatever we already collected */
    }
  }
  return [...keys];
}

export function clearAll(): void {
  for (const key of listKeys()) removeRaw(key);
}
