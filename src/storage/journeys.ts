import { readJson, writeJson } from '../services/storage';
import type {
  JourneyEvent,
  JourneyEventKind,
  JourneyInput,
  MonitoringState,
  RecommendationVersion,
  SavedJourney,
} from '../domain/types';

const KEY = 'journeys';
const MAX_EVENTS = 60;
const MAX_VERSIONS = 25;

/**
 * Saved journeys live in this browser and nowhere else.
 *
 * There is no account, no server and no sync. That is a deliberate product
 * decision, not a missing feature: a journey record contains where someone
 * lives and who they are collecting, and the safest place for that is the
 * device it was typed into.
 */
export function loadJourneys(): SavedJourney[] {
  const stored = readJson<SavedJourney[]>(KEY);
  return Array.isArray(stored) ? stored : [];
}

export function saveJourneys(journeys: SavedJourney[]): void {
  writeJson(KEY, journeys);
}

export function newId(now: number = Date.now()): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${now.toString(36)}-${random}`;
}

export function createJourney(
  label: string,
  input: JourneyInput,
  now: number = Date.now(),
): SavedJourney {
  return {
    id: newId(now),
    label,
    createdAt: now,
    updatedAt: now,
    input,
    monitoring: 'active',
    lastCheckedAt: null,
    versions: [],
    events: [
      { id: newId(now), at: now, kind: 'created', message: `Journey saved and monitoring started.` },
    ],
  };
}

export function appendEvent(
  journey: SavedJourney,
  kind: JourneyEventKind,
  message: string,
  now: number = Date.now(),
): SavedJourney {
  const event: JourneyEvent = { id: newId(now), at: now, kind, message };
  return {
    ...journey,
    updatedAt: now,
    events: [...journey.events, event].slice(-MAX_EVENTS),
  };
}

export function appendVersion(
  journey: SavedJourney,
  version: RecommendationVersion,
): SavedJourney {
  return {
    ...journey,
    updatedAt: version.createdAt,
    versions: [...journey.versions, version].slice(-MAX_VERSIONS),
  };
}

export function latestVersion(journey: SavedJourney): RecommendationVersion | null {
  return journey.versions.length ? journey.versions[journey.versions.length - 1]! : null;
}

export function setMonitoring(
  journey: SavedJourney,
  monitoring: MonitoringState,
  now: number = Date.now(),
): SavedJourney {
  return { ...journey, monitoring, updatedAt: now };
}

export function upsert(journeys: SavedJourney[], journey: SavedJourney): SavedJourney[] {
  const index = journeys.findIndex((candidate) => candidate.id === journey.id);
  if (index === -1) return [journey, ...journeys];
  const next = [...journeys];
  next[index] = journey;
  return next;
}

export function remove(journeys: SavedJourney[], id: string): SavedJourney[] {
  return journeys.filter((journey) => journey.id !== id);
}
