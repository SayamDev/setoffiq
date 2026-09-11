import { readJson, removeRaw, writeJson } from './storage';

interface CacheEntry<T> {
  value: T;
  storedAt: number;
}

export interface CacheHit<T> {
  value: T;
  storedAt: number;
  ageMinutes: number;
  fresh: boolean;
}

/**
 * A small TTL cache over local storage.
 *
 * Expired entries are still returned, marked `fresh: false`, because showing
 * clearly-labelled old data beats showing nothing when a provider is down.
 */
export function readCache<T>(key: string, ttlMinutes: number, now: number): CacheHit<T> | null {
  const entry = readJson<CacheEntry<T>>(`cache:${key}`);
  if (!entry || typeof entry.storedAt !== 'number') return null;
  const ageMinutes = Math.round((now - entry.storedAt) / 60_000);
  return { value: entry.value, storedAt: entry.storedAt, ageMinutes, fresh: ageMinutes < ttlMinutes };
}

export function writeCache<T>(key: string, value: T, now: number): void {
  writeJson(`cache:${key}`, { value, storedAt: now } satisfies CacheEntry<T>);
}

export function dropCache(key: string): void {
  removeRaw(`cache:${key}`);
}
