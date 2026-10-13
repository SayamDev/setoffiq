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

Final date review: voice-relative dates now advance the Manchester calendar
rather than adding 24-hour durations, avoiding skipped/repeated dates near DST
midnight. Two added regression cases bring the suite to 359 tests (50 parser
cases), passing under Node 22.23.3; lint, typecheck and build also pass.

## Follow-up correction checks — 12 October 2026

- Pending AM/PM questions now survive unrelated details such as a postcode.
- Voice drafts distinguish user choices from route/terminal facts inferred from a
  flight. Changing the flight, origin, airline or date clears old inferred facts;
  explicit user choices survive. Origin/airline corrections clear the old flight
  number so it cannot keep tracking a different journey.
- Changing pickup to drop-off requires the new flight time and updates the page
  heading/navigation when the structured journey is submitted.
- Speech results preserve prior final segments together with current interim
  text. A mixed result no longer aborts and discards the sentence's unfinished
  tail. No extra debounce or model call was added.
- 368 tests pass under Node 22.23.3, with lint, strict typecheck and production
  build passing. Added regression coverage includes a domestic-to-international
  flight correction through the real planner. Chrome production preview verified
  pending AM/PM after a keyboard-submitted postcode and a direction change.
- Real-device microphone/noise/OS-lock testing remains pending as documented.

## Release preparation — 12 October 2026

The user authorised merging and publishing the voice feature. The release audit
found a pre-existing high-severity source-map-js build-tool advisory
(GHSA-68fv-2mgg-jv7q). The lockfile now selects the compatible 1.2.2 patch instead
of 1.2.1; no runtime dependency or application API changed. npm audit reports zero
vulnerabilities after the patch.

Rollback: revert the voice PR merge on main and let the existing Pages workflow
redeploy. There are no migrations or new saved-journey schema fields to undo;
voice draft ownership metadata remains transient. The pre-feature main revision
is 982a0ba080ea6c84470ccf67465b01c4062f7d78. Verify a restored deployment's hydrated
journey form and asset hashes rather than relying only on an HTTP 200 response.

## Natural/contextual voice follow-up — 12 October 2026

`codex/natural-contextual-voice` replaces repetitive numeric/date readouts with
short deterministic pickup/drop-off/late/uncertain reply templates and spoken
clock/range/date formatting. “Why that time?” reads engine ranges/allowances.
No LLM or prediction rule changes. Original text forms/explanations stay intact.

Optional Kokoro q8/WASM or accelerated fp32/WebGPU in a separate worker provides British Emma speech,
explicitly downloaded from the planning page. First load includes model download
and warm-up; cached files restore a new runtime after reopening. Device speech is
immediate during load/failure and prefers British/enhanced local voices. UI records
which voice actually played. Short chunks avoid tokenizer truncation. Audio blobs
are transient, URLs revoked, requests cancelled/stale ids ignored. Load/generation/
playback and late browser voice discovery have bounded timeouts.

The optional worker bundle includes GPL-3.0-or-later eSpeak through phonemizer;
original app source remains MIT. Full notices/licence/source archives ship under
public/licenses, with a banner in the worker and a privacy-page link. See
THIRD-PARTY-NOTICES.md. eSpeak archive language/voice data was checked against
phonemizer’s distributed worker (328 matching files); upstream provides no build
revision in the npm package. Archives retain the source/build files.

Voice caches are isolated with setoffiq-voice-* names. Remove voice download and
Settings clear them; SW activation now deletes only obsolete SetoffIQ shell caches.
No transcripts, generated audio or location enter storage/model asset requests.

A full-suite evening run exposed two old JourneyForm timetable fixtures relying
on Date.now(): their arrival moved past midnight while the picker stayed on today.
The fixtures now use an explicit midday clock; production behaviour is unchanged.
Node-only sharp/global-agent overrides resolve newly installed transitive audit
issues. No new provider key/account/backend was added.

Chrome production-preview download/warm-up, generated preview completion and cached
reload were checked. Actual phone RAM/battery/autoplay/lockscreen and subjective
voice quality need physical-device/user testing; slow devices can pause between
sentences. VoiceStudio requires a running local API and was not integrated into
this public phone app. Keep the device/text fallbacks.


Playback review found CPU inference exceeding the bounded generation deadline;
WebGPU fp32 is now selected when an adapter is available (larger, disclosed ~350 MB
model/style download), with q8 WASM otherwise (~115 MB). A separate production CSP
issue blocked blob audio playback; media-src now permits only self/blob and
worker-src only self. Remote scripts/audio remain disallowed. The UI reports
actual output voice and timeout/blocked-playback fallbacks. See SECURITY.md.


Final checks: production build, strict typecheck, lint and dependency audit (zero
reported vulnerabilities) pass. Expanded suite has 398 tests; the whole run
passed 397 while a single presentation assertion still assumed a reply started
with the time even for the engine's “wait” advisory. That assertion now checks the
single departure alongside the preserved advisory, and the complete presentation
suite passes. PR CI runs the full suite. Chrome confirmed WebGPU readiness and
actual natural-audio playback (not device fallback), cached reload, Stop during
preparation and 390px controls with 48px targets and no horizontal overflow.
Rollback remains a PR revert; no journey-schema migration was introduced.

## Voice-first UX refinement (October 2026)

- Preserved timetable/pine identity, existing routes and primary nav. Voice/form
  input modes reduce competing controls; original form stays mounted until a plan.
- First-visit native dialog with skip/replay, keyboard dismissal and a real-parser
  correction example. Only `welcome-seen-v1` is persisted. No analytics.
- Local Lottie asset at `public/projects/voice-guide/scene-1/lottie.json`, verified
  in the official diffusionstudio/lottie Skottie player at 0/36/71 and playback.
  Production uses lazy Lottie light (no expressions), reduced-motion still frame.
- Cancellable automatic natural-voice preparation after paint, persistent opt-out,
  offline/Data Saver/reported slow-network deferral. No automatic microphone/audio.
- Bounded help/repeat/edit/reset/navigation actions. Navigation stops the session.
  Explicit postcode step and spoken flight options improve hands-free follow-ups.
- Supporting result sections collapsed; confidence and primary recommendation stay
  visible. Engine/provider prediction logic unchanged.

### Guided conversation refinement

- One stateful microphone control: Start talking, Listening — stop, Checking your
  journey (disabled during a check), Interrupt and talk. Escape and background
  suspension still stop the session.
- Specific next questions and a directly editable JourneySummary, with native
  field validation, keyboard focus/return and Cancel. Editing pauses voice;
  applying a patch uses the existing validated journey/engine pipeline.
- Recommendation above follow-up controls, grouped result actions and progressive
  help/settings. Explicit microphone privacy remains visible.
- Shorter deterministic spoken result/help and longer bounded speech chunks to
  avoid excessive mid-sentence fragments. Kokoro remains synthesised; genuine
  human prompt recordings require original/licensed assets and are not shipped.
