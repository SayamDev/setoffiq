/**
 * The URL of a file SetoffIQ publishes beside itself.
 *
 * A deliberate refresh — someone opening the flight picker — has to reach the
 * newest published file, so it carries a cache-buster: without it the browser's
 * HTTP cache, and `fetchJson`'s in-flight deduplication, are both keyed on a
 * URL that has not changed.
 */
export function dataUrl(path: string, forceRefresh = false): string {
  // Vite rewrites BASE_URL for the GitHub Pages sub-path at build time.
  // `||` not `??`: an empty base would silently produce a relative URL.
  const base = import.meta.env.BASE_URL || '/';
  const url = `${base}${path}`.replace(/([^:]\/)\/+/g, '$1');
  return forceRefresh ? `${url}?t=${Date.now()}` : url;
}
