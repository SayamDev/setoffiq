import { useCallback, useEffect, useState } from 'react';
import type { SavedJourney } from '../domain/types';
import { loadJourneys, remove as removeJourney, saveJourneys, upsert } from '../storage/journeys';

/**
 * Saved journeys, kept in state and mirrored to local storage. The storage
 * event keeps two tabs of the same browser in step.
 */
export function useJourneys(): {
  journeys: SavedJourney[];
  save: (journey: SavedJourney) => void;
  remove: (id: string) => void;
  clear: () => void;
} {
  const [journeys, setJourneys] = useState<SavedJourney[]>(() => loadJourneys());

  useEffect(() => {
    const onStorage = (): void => setJourneys(loadJourneys());
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const save = useCallback((journey: SavedJourney) => {
    setJourneys((current) => {
      const next = upsert(current, journey);
      saveJourneys(next);
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setJourneys((current) => {
      const next = removeJourney(current, id);
      saveJourneys(next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setJourneys([]);
    saveJourneys([]);
  }, []);

  return { journeys, save, remove, clear };
}
