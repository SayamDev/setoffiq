import { useEffect, useState } from 'react';
import type { JourneyKind } from '../domain/types';

/**
 * A hash router in forty lines.
 *
 * Hash routing works on static hosting without server rewrites, and a router
 * library would be more bytes than the whole feature is worth.
 */
export type Route =
  | { name: 'home' }
  | { name: 'plan'; kind: JourneyKind }
  | { name: 'journeys' }
  | { name: 'journey'; id: string }
  | { name: 'settings' }
  | { name: 'about' }
  | { name: 'estimates' }
  | { name: 'data-sources' }
  | { name: 'privacy' }
  | { name: 'diagnostics' };

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#\/?/, '').split('?')[0] ?? '';
  const [head, tail] = path.split('/');

  switch (head) {
    case 'pickup':
      return { name: 'plan', kind: 'pickup' };
    case 'dropoff':
      return { name: 'plan', kind: 'dropoff' };
    case 'journeys':
      return tail ? { name: 'journey', id: tail } : { name: 'journeys' };
    case 'settings':
      return { name: 'settings' };
    case 'about':
      return { name: 'about' };
    case 'estimates':
      return { name: 'estimates' };
    case 'data-sources':
      return { name: 'data-sources' };
    case 'privacy':
      return { name: 'privacy' };
    case 'diagnostics':
      return { name: 'diagnostics' };
    default:
      return { name: 'home' };
  }
}

export function hrefFor(route: Route): string {
  switch (route.name) {
    case 'home':
      return '#/';
    case 'plan':
      return route.kind === 'pickup' ? '#/pickup' : '#/dropoff';
    case 'journeys':
      return '#/journeys';
    case 'journey':
      return `#/journeys/${route.id}`;
    default:
      return `#/${route.name}`;
  }
}

export function navigate(route: Route): void {
  window.location.hash = hrefFor(route);
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));

  useEffect(() => {
    const onChange = (): void => {
      setRoute(parseHash(window.location.hash));
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return route;
}
