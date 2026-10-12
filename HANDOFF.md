# Where things stand — 12 September 2026, 09:30

Everything below is pushed; CI and the deploy are green on `817fa7e`. Read
`DATA-SOURCES.md` and `ARCHITECTURE.md` before changing anything: they carry
every provider's verified terms and the traps in the data.

## What changed yesterday

- **Flight positions moved from OpenSky to adsb.lol.** OpenSky's terms require
  a written agreement for any operational use of its API; adsb.lol is ODbL and
  permits this. Recorded in `DATA-SOURCES.md`.
- **Reported routes** from the Virtual Radar Server standing data (CC0), so
  aircraft bound elsewhere are no longer offered as Manchester arrivals.
- **The airline schedule** from AirLabs, on a free key in the `AIRLABS_KEY`
  repository secret: ten hours of arrivals and departures with delays and
  cancellations, refreshed at most every 4.5 hours, capped at 900 requests a
  month by `scripts/fetch-schedule.mjs`.
- **SetoffIQ's own record** of landings and take-offs (`EGCC-history.json`),
  used when the schedule is unavailable.
- **UI**: each figure is now stated once, with its reasoning behind a
  disclosure on its row; "Check now" reports what it found and waits fifteen
  seconds; the activity log no longer records checks that changed nothing.

## The open question

**GitHub is not honouring the 15-minute schedule.** Overnight it ran at 00:04,
04:40 and 08:51. At 07:15 the flight snapshot was four hours old, so EK21 was
never matched — correctly, because positions over an hour old are not used.

Options, none started:

1. Accept it and document the refresh as best-effort.
2. Trigger the deploy from a free external scheduler (cron-job.org, a
   Cloudflare Worker). Fixes it, but needs another account and a GitHub token
   held by a third party.
3. Keep it, and lean on the staleness labels the app already shows.

A browser-side refresh is not available: adsb.lol sends no CORS header.

## Settled overnight

- **EK21 is `UAE21`.** This morning's schedule confirms it; adsbdb's `UAE1KM`
  was wrong. The README is right as written.
- **Monitoring works** over many hours: hourly checks six hours out, tightening
  as the flight approaches, stopping after landing.
- Both watch machines slept overnight, so neither log covers 01:00–07:00.

## Not done, deliberately

- Notifications have never run on a real phone (Android or iPhone).
- The "usually" lists need three days of recording; they should fill from
  Monday 14 September.
- Contrast that axe cannot measure has not been checked by eye.
- Optional: a courtesy note to adsb.lol, who ask production users to get in
  touch.

## Commands

```bash
npm test        # 229
npm run lint
npm run typecheck
npm run build
```

Push to `main` deploys.

## Voice feature branch — 12 October 2026

`codex/hands-free-voice` adds an English deterministic utterance/action pipeline,
existing-data flight matching, browser speech recognition and local-only spoken
replies on both planning pages. The text form, prediction engine and monitoring
implementation are reused. No backend, services, credentials or npm dependencies
were added. Transcripts/audio are never logged or persisted.

README now records usage, feature-detected support, off-device recognition privacy,
known parser/data limits, tap-to-interrupt replies and lifecycle behaviour. The
privacy page has the same disclosure. ARCHITECTURE and COSTS explain the boundary
and the pre-existing CI-only AirLabs/provider keys, correcting older contradictory
claims without changing the data jobs.

Tests cover the parser corpus, structured validation, DST gaps/repeated hours,
matching/multiple candidates, callsign/codeshare handling, a full utterance-string
journey through real providers and the real engine to monitoring, cancellations,
transcript storage absence, stale requests, permission failures, echo avoidance,
silence expiry, keyboard stop and hiding/returning. Physical microphone, noisy-car,
VoiceOver/TalkBack and actual iOS/Android locked-screen checks remain pending.
Browser callback tests simulate lifecycle changes; they do not prove OS behaviour.

Production Chrome preview verified at 390px with 48px voice buttons, no horizontal
overflow and no console warnings/errors. The local committed flight snapshot was
31 days old, and the real result correctly exposed the scheduled-time fallback
and low confidence. Preview requires the Pages base explicitly:
`npm run preview -- --host 127.0.0.1 --base /setoffiq/`.

The first PR CI run exposed two pre-existing route-description assertions that
assumed Rabat and the UK share a September clock. Node 22’s ICU data disagreed
with local Node 26. Those formatting tests now supply an explicit UTC+1 fixture;
production timezone handling is unchanged. All 357 tests pass locally under both
Node 26 and CI’s exact Node 22.23.3 version.
