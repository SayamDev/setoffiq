# Architecture

SetoffIQ is a static single-page application. There is no backend, no database
and no server-side rendering, and that is a deliberate constraint rather than a
simplification: the fewer things there are to run, the easier it is to keep the
cost at zero and the privacy story honest.

```
┌──────────────────────────────────────────────────────────────┐
│  Browser                                                     │
│                                                              │
│  UI layer          pages/ · components/ · app/               │
│       │            React 19, CSS Modules, hash routing       │
│       ▼                                                      │
│  Hooks             hooks/                                    │
│       │            planning, monitoring, storage, settings   │
│       ▼                                                      │
│  Services          services/                                 │
│       │            provider adapters · cache · http ·        │
│       │            usage tracking · notifications · AI       │
│       ▼                                                      │
│  Domain            domain/                                   │
│                    types · airport profiles · assumptions ·  │
│                    prediction engine (pure)                  │
│                                                              │
│  Storage           localStorage, namespaced `setoffiq:`      │
└──────────────────────────────────────────────────────────────┘
            │                             ▲
            ▼                             │
   Public data services          Static flight snapshot
   Open-Meteo · OSRM ·           published by GitHub Actions
   postcodes.io
```

Dependencies point inwards only. The domain layer imports nothing from
services or UI; services import domain types but never React; UI composes both.

## Domain layer — `src/domain/`

The only part that decides anything.

- **`types.ts`** — every domain model, under strict TypeScript with no `any`.
  Time is always an `Instant` (epoch milliseconds). Wall-clock strings exist
  only at the edges, in `time.ts`.
- **`time.ts`** — timezone-aware conversion built on `Intl`, so daylight saving
  comes from the platform's timezone database rather than a hand-written table.
  `zonedTimeToInstant` runs two passes because the offset depends on the instant
  being resolved — that is what makes the clocks-change tests pass.
- **`assumptions.ts`** — every tunable number in one file: processing buffers,
  journey uncertainty fractions, cache TTLs, polling intervals, notification
  thresholds. If a figure is a product assumption rather than sourced data, it
  lives here and is labelled as such in the UI.
- **`airports/`** — airport profiles as data. Adding Heathrow means adding a
  profile, not touching the engine.
- **`engine/`** — the prediction engine. Pure functions: no network, no clock,
  no DOM. `now` is passed in, so every recommendation is reproducible from its
  inputs alone. This is what makes the whole thing testable.

### The calculation

```
pickup:
  landing          = live estimate ?? the scheduled time you entered
  readiness        = landing + disembarkation + border + baggage + walk
  airport arrival  = readiness.earliest − time needed at the airport
  departure        = airport arrival − the slowest plausible journey

drop-off:
  terminal target  = flight departure − check-in buffer (upper bound)
  airport arrival  = terminal target − parking/walking buffer
  departure        = airport arrival − the slowest plausible journey
```

The journey range takes the routed free-flow time as its lower bound and widens
the upper bound for traffic, weekday peak hours, weather, and — when no routing
service answered — for having no route at all.

## Provider layer — `src/services/`

Every external service sits behind a typed interface (`FlightProvider`,
`WeatherProvider`, `RoutingProvider`, `AIProvider`) and returns an
`Observed<T>` envelope carrying the value, its state (`ok` / `stale` /
`unavailable`), when it was fetched, when it was observed at source, and a
user-safe message. Provider-specific field names never escape the adapter.

- **`http.ts`** — one fetch path for everything: timeout via `AbortController`,
  bounded retries with exponential backoff, request deduplication, and a
  minimum interval between calls to the same provider. 4xx responses are never
  retried, because repeating a request the server already rejected is exactly
  the pointless traffic these free services ask us not to generate.
- **`cache.ts`** — TTL cache over local storage. Expired entries are still
  returned, marked stale, because clearly-labelled old data beats a blank
  screen.
- **`usage.ts`** — counts requests per provider in hourly buckets. Counts are
  kept separately from the capped record list, so they stay accurate past the
  cap. Surfaced on the diagnostics page.
- **`flight/`** — reads the static flight snapshot (adsb.lol positions with
  reported routes), matches a flight number to broadcast callsigns, rules out
  aircraft that cannot be arriving here, and estimates an on-stand time from
  position and ground speed. Also holds the labelled test scenarios.
- **`plan.ts`** — gathers all three providers concurrently and hands plain data
  to the engine. Each provider failure is contained; none can take down another.

## Storage

Everything persisted goes through `services/storage.ts`, which namespaces all
keys under `setoffiq:` and degrades to memory when storage is unavailable
(private browsing, blocked origins). Because there is exactly one write path,
"Clear all local data" can genuinely clear everything.

## Monitoring

`hooks/useMonitoredJourney.ts` re-plans a saved journey, compares the result
with the previous version, and only surfaces changes that are meaningful — a
departure moving past a configurable threshold, or a flight changing state.
Small drifts go to the activity log without interrupting anyone.

The polling interval comes from `engine/polling.ts` and widens with distance
from the flight: three hours out when the flight is over a day away, five
minutes when the aircraft is airborne, and it stops entirely once the flight has
landed, been cancelled or diverted.

The honest limitation: a browser app cannot run when the browser is closed.
SetoffIQ checks while it is open, checks again when the tab becomes visible, and
says so in the interface rather than implying a background service exists.

A meaningful change raises a browser notification through the service worker's
`showNotification`, falling back to `new Notification()` only when no worker is
registered. The order matters: Chrome on Android throws on the constructor, so
a page-built notification there would never appear. Tapping one opens the
journey it is about.

An explicit "Check now" bypasses the snapshot cache — serving a cached answer to
a deliberate request would be misleading.

## Explanations

`services/ai/` exposes an `AIProvider` seam with two implementations: a local
Ollama model, and a rule-based generator that assembles prose from the same
structured numbers the engine produced.

The rule-based one is the default and the only one the published site uses. It
is labelled "Standard recommendation explanation" rather than dressed up as AI.

Either way the engine has already decided every number. The explanation layer
receives a narrow payload with no address, postcode or coordinates in it — the
drive appears only as a duration — and it cannot change a single time.

## Failure handling

| Failure | Behaviour |
| --- | --- |
| Flight snapshot unreachable | Scheduled time used; card says the data is unavailable; confidence drops |
| Snapshot stale | Last known values shown with their age; confidence drops |
| Aircraft not found | Scheduled time used, stated explicitly on the flight card |
| Flight cancelled or diverted | No recommendation is produced at all; monitoring stops |
| Routing down | Both public instances tried, then a distance-based estimate, flagged in the UI |
| Weather down | Recommendation proceeds without a weather allowance, and says so |
| Local model down or off | Rule-based explanation, honestly labelled |
| Offline | App shell loads from the service worker; a banner explains live data is unavailable |

No single provider can prevent a recommendation from being produced when the
remaining information is sufficient — and when it genuinely is not, the app says
it cannot safely calculate one rather than inventing something.

## Choosing a flight

Three published files feed the picker, and each is allowed to say only what it
knows:

| File | From | Refreshed | What it can say |
| --- | --- | --- | --- |
| `EGCC-arrivals.json` | adsb.lol positions | every deploy | What is in the air right now, timed from where it is |
| `EGCC-schedule.json` | AirLabs `/schedules` | every 4.5 h | About three hours either side of now, with delays and cancellations |
| `EGCC-timetable.json` | AirLabs `/routes` | weekly | What is meant to fly, any hour of any day, with no status at all |

The timetable is what makes the picker work at two in the morning and for a
pickup next week; the schedule overrides it wherever the two overlap, because it
is the one that knows whether a flight is actually running. Opening the picker
re-fetches all three past the browser cache, with skeleton rows while it waits,
and falls back to the last copy it holds if a fetch fails.

## Build and deploy

Vite builds a static bundle. `.github/workflows/deploy.yml` refreshes the flight
snapshot, builds, and publishes to GitHub Pages on every push and on a schedule.
`.github/workflows/ci.yml` runs lint, typecheck, tests and a production build on
every push and pull request.
