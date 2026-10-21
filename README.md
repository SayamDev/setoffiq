# SetoffIQ

### Know when to set off. Know when to wait.

SetoffIQ is a free airport pickup and drop-off planner that combines available
flight, journey and weather information to help you decide when to set off.

**[Open SetoffIQ](https://sayamdev.github.io/setoffiq/)** — no account, no API
key, no install.

---

## The problem

Airport pickups go wrong in a specific, avoidable way: the driver has no idea
when the passenger will actually walk out. So they leave early, park, and wait —
paying for parking and burning an hour — or they leave on the scheduled arrival
time and the passenger stands on a kerb.

The scheduled arrival time is not the useful number. Between touchdown and
someone appearing in arrivals there is taxiing, disembarkation, possibly border
control, a bag belt and a walk. That gap is routinely 25–60 minutes and it is
invisible to the person sitting in the car.

## What SetoffIQ does

It works back from when the passenger is realistically going to be ready:

```
landing (live estimate, or the scheduled time)
  + getting off the aircraft, border control, bags, the walk out
  = passenger readiness window
  − time needed at the airport for the chosen pickup style
  − the slowest plausible drive
  = leave at this time
```

Using the **slowest** end of the drive is the whole trick. It puts the driver's
worst case on the passenger's best case, so the driver is rarely early enough to
wait around and rarely late enough that the passenger does.

Drop-offs work the same way in reverse, from the departure time.

## What it looks like

The recommendation leads with one number, because that is the only thing anyone
actually needs:

```
RECOMMENDED DEPARTURE                              ●●○ MEDIUM CONFIDENCE

14:11
Today · MAN time        Leave at 14:11
                        That is 2 hr 57 min from now, and puts your
                        passenger at the terminal by about 15:14.

AT THE TERMINAL      ARRIVE AT AIRPORT      JOURNEY
15:09–15:14          14:51–14:56            40–45 min
```

Then, beneath it, what that answer rests on:

```
WHAT'S AFFECTING YOUR TIMING?
◻ TIME AT THE TERMINAL   120–180 min — a SetoffIQ assumption …      Estimated
◼ ROUTE                  40–45 min, routed over real roads …        Live · 11:14
◻ FLIGHT                 The departure time on your booking.        From you
◼ AIRPORT CONDITIONS     Marginal conditions                        Live · 10:50
◼ ROAD DISRUPTION        13 roadworks nearby, none closing a road   Live · 11:12
```

Confidence is derived from those rows, so the score can never disagree with the
table explaining it.

## Key features

- **A deterministic prediction engine.** Same inputs, same recommendation, every
  time. No randomness, no model deciding what time you leave.
- **Live aircraft positions** where they exist, via a scheduled snapshot from
  adsb.lol, matched to your flight number by callsign — or picked from a list of
  aircraft inbound right now, each with its airline and reported origin, or from
  flights that *usually* land in the next twelve hours, from SetoffIQ's own
  record of landings.
- **Real routing** to the terminal itself over OpenStreetMap data, plus the
  aerodrome's own weather observation and road closures. A fresh closure or
  incident changes the journey estimate only when its reported location is on
  or very close to the driver's route.
- **Passenger stages**, because a landed flight is not a ready passenger — and
  the stages that are inferred rather than observed say so.
- **Windows, not false precision.** "Ready between 18:55 and 19:15", never
  "ready at 19:03".
- **Every number is sourced.** Each factor is tagged as live data, something you
  entered, or a SetoffIQ assumption. They are never presented as one another.
- **Monitoring** that recalculates when the flight moves, tells you what changed
  and why, and keeps an auditable history.
- **Graceful degradation.** Weather down? Recommendation still works, without a
  weather allowance. Routing down? Estimated from distance, and it says so.
- **Local-first.** No account, no server, no tracking. Saved journeys live in
  your browser.
- **£0 to run and £0 to use**, by design rather than by luck.

## How it works

```
                    You
                     │
              SetoffIQ UI (React, static)
                     │
        ┌────────────┼────────────┬──────────────┐
        │            │            │              │
   Flight        Weather      Routing        Postcode
  snapshot      Open-Meteo      OSRM        postcodes.io
 (adsb.lol via
 GitHub Actions)
        │            │            │              │
        └────────────┴─────┬──────┴──────────────┘
                           │
                Provider adapters
        (timeouts, retries, caching, dedup,
         request counting, stale handling)
                           │
                 Normalised domain objects
                           │
                  Prediction engine
        (readiness window → arrival window →
         departure time → confidence)
                           │
                   Recommendation
                           │
           Explanation (rule-based, or a local
            model that only rewords the result)
                           │
                          You
```

The important line in that diagram is the one *below* the prediction engine.
The engine decides every time and every window. The explanation layer only puts
it into words — it cannot change a single number. That keeps the product
deterministic, testable and debuggable, which a language model in the decision
path would not be.

### About the flight data

This is the part most projects quietly fake, so to be explicit about what is and
is not possible for free:

adsb.lol gives **aircraft positions** — where something broadcasting a given
callsign is, how fast, how high, which way it is heading, climbing or
descending. The Virtual Radar Server standing data adds the **route reported**
for that callsign. Neither gives airline schedules, gate information, or any
status for a flight that has not taken off.

A scheduled GitHub Actions job fetches both about four times an hour and
publishes one static JSON file alongside the app, so no visitor's browser calls
a flight-data service and usage does not grow with traffic. adsb.lol publishes
its data under the Open Database Licence, which permits exactly that; the routes
are public domain (CC0).

The app used The OpenSky Network until 11 September 2026, when its terms turned
out to require a written agreement for any operational use of its API — see
[DATA-SOURCES.md](DATA-SOURCES.md).

So SetoffIQ can tell you *"that aircraft is 60 km out, descending, so expect it
on stand about 18:34"*. It cannot tell you *"your flight is delayed"* before the
aircraft is in the air, and it does not claim to. When no aircraft is found, it
uses the scheduled time you entered, unchanged, and says exactly that on screen.

Not every airline helps, either. Ryanair and easyJet broadcast alphanumeric
callsigns unrelated to the flight number on your ticket, so those will not automatically match
a flight number you type (you can explicitly link a verified callsign on a saved pickup), and some airlines vary their callsigns — the standing
data lists Emirates' Dubai–Manchester service as both `UAE21` and `UAE1KM`. The
app is honest about that rather than guessing.

## Privacy

Everything that matters stays on your device. Saved journeys, your starting
postcode, flight numbers, settings and caches all live in this browser's local
storage. There is no account and no server holding any of it.

What does leave your device: your postcode goes once to postcodes.io to become
coordinates; your coordinates and the airport's go to a public OSRM instance for
the drive; the airport's coordinates go to Open-Meteo for the weather. The
explanation layer never receives your address, postcode or coordinates — the
drive reaches it only as a duration.

There is no analytics, no advertising and no third-party tracker of any kind.

Settings has a **Clear all local data** button that removes saved journeys,
preferences, provider caches and downloaded voice model/style files. Journey data
is managed by one namespaced storage module; voice assets use isolated caches.
Cached app-shell and speech-runtime files may remain, without personal data.

## Costs

**Owner: £0. User: £0.** Not "free tier, watch your usage" — there is no billing
mechanism attached to anything in the stack, so a mistake cannot produce a bill.

See [COSTS.md](COSTS.md) for the audit and [DATA-SOURCES.md](DATA-SOURCES.md)
for each provider's current terms and the date they were checked.

## Data sources

| Provider | Provides | Terms |
| --- | --- | --- |
| [adsb.lol](https://www.adsb.lol/) | Aircraft positions | Free, keyless, ODbL 1.0 — republishing with attribution permitted |
| [Virtual Radar Server standing data](https://github.com/vradarserver/standing-data) | Reported routes by callsign | CC0 1.0 (public domain), community-submitted |
| [AirLabs](https://airlabs.co/) | Manchester's schedule, delays and cancellations | Free plan, keyed (CI only), 1,000 requests/month; refreshed every 4.5 hours |
| [NOAA Aviation Weather Center](https://aviationweather.gov/data/api/) | Aerodrome observations (METAR) | Public domain, no key, no billing |
| [National Highways](https://developer.data.nationalhighways.co.uk/) | Road and lane closures | Free, keyed, OGL 2.0, redistribution permitted |
| [TomTom Traffic Incidents](https://docs.tomtom.com/traffic-api/documentation/tomtom-orbis-maps/v2/traffic-incidents/incident-details) | Optional accidents, jams and roadworks | Keyed; one shared request every 20 minutes when enabled |
| [Open-Meteo](https://open-meteo.com/) | Weather | No key, 10,000 calls/day, non-commercial, CC BY 4.0 |
| [OSRM](https://project-osrm.org/) (FOSSGIS + project instances) | Driving time and distance | No key, no billing, no live traffic |
| [postcodes.io](https://postcodes.io/) | UK postcode → coordinates | MIT, ONS/OS open data, no key |
| [OpenStreetMap](https://www.openstreetmap.org/copyright) | Road network | ODbL, attributed in the app |
| Ollama (optional) | Explanation wording | Runs on your own machine; off by default |

## Limitations

Stated plainly, because a planner that oversells itself is worse than useless:

- **No airline schedules.** SetoffIQ cannot know a flight is delayed before the
  aircraft is airborne. You supply the scheduled time from your booking.
- **Callsign matching is partial.** Ryanair and easyJet flight numbers do not
  correspond to broadcast callsigns.
- **No live traffic.** OSRM models free-flow driving. The upper bound of every
  journey estimate absorbs that, but it is an allowance, not a measurement.
- **No queue data.** Border control, security and baggage times are SetoffIQ
  assumptions, documented in [DATA-SOURCES.md](DATA-SOURCES.md) and labelled as
  assumptions in the app. They are not airport statistics.
- **National Highways disruption covers major roads only.** National Highways operates the
  Strategic Road Network, so the M56 and M60 are covered and local roads are
  not. The feed reports planned works and unplanned closures, not every accident
  or traffic jam. Route matching uses event locations, not measured traffic
  delay. Old snapshots and events merely near the airport do not widen the
  estimate. Routine roadworks are reported but deliberately do not widen the
  estimate — dozens of live lane closures is the normal state of the network,
  and a warning that is always on is not a warning.
- **No flight schedules.** Nothing free will tell you which flights land
  tomorrow, so the inbound picker can only offer aircraft already in the air.
- **No parking prices.** There is no reliable free source, so none are shown.
- **Monitoring only runs while the app is open.** A browser app cannot run in the
  background when the browser is closed, and this one does not pretend to. It
  checks while open, and refreshes immediately when reopened.
- **The position snapshot can be up to ~15 minutes old**, and GitHub's scheduled
  runs are best-effort. Every card shows its own age, and staleness lowers
  confidence.
- **Manchester only, for now.** Airports are data, not code — adding one is a
  profile, not a rewrite.

## Local development

```bash
git clone https://github.com/sayamdev/setoffiq.git
cd setoffiq
npm install
npm run dev
```

No configuration is needed. There are no API keys anywhere in this project.

To refresh the flight position snapshot locally:

```bash
node scripts/fetch-flight-snapshot.mjs
```

Optional: to have a local model word the explanations, run Ollama
(`ollama serve`, `ollama pull llama3.2`) and switch it on in Settings. The
published site never uses it.

## Testing

```bash
npm test          # unit, integration and end-to-end tests
npm run typecheck # strict TypeScript
npm run lint      # oxlint
npm run build     # production build
```

## Deployment

Pushing to `main` builds and deploys to GitHub Pages via
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). The same
workflow runs on a schedule to refresh the flight snapshot, so the published
site stays current without anyone committing data.

To deploy your own copy: fork, enable Pages with **Source: GitHub Actions** in
repository settings, and push. Nothing else is required — no secrets, no
environment variables, no billing account.

## Licence

[MIT](LICENSE).

SetoffIQ is an independent travel-planning application and is not affiliated
with any airline or airport. It provides estimates for planning purposes. Flight
times, passenger processing, traffic and weather may change — allow appropriate
additional time and follow official airport and airline guidance.

## Hands-free journey planning

Open **Plan a pickup** or **Plan a drop-off**, then tap **Start talking** in
**Talk through your journey**. Microphone use starts only after that tap and
browser permission. For example:

> “I'm picking someone up at 6:30 today, Ryanair from Rabat.”

SetoffIQ shows a live transcript and the structured details it understood. If
6:30 could mean morning or evening, it asks AM/PM; if the time could be a meeting
time, it asks for the flight landing time. Say “PM” and “landing time”, or tap the
answers. Enter the starting postcode once in the understood-details controls.
With enough information, the existing deterministic engine runs automatically.
Its set-off time, windows, confidence and data caveats appear on screen and are
read aloud when a local English voice is available.

- Correct a detail: “no, 7 o'clock”, “actually 19:00”, “tomorrow”, “hand luggage
  only”, “terminal two”, or open **Understood details** and edit a field.
- Changing the flight or its origin clears route/terminal details inferred from
  the old flight, while retaining choices you explicitly entered. Unanswered
  time questions remain pending when you add another detail such as a postcode.
- Ask “why that time?” for the standard explanation, or “start monitoring” to
  save the structured journey and open the existing monitoring screen.
- Multiple matches are offered as numbered options. Say “option one” or tap one.
  Matching uses the existing schedule, timetable and inbound-position adapters,
  including their age limits. A timetable match carries **no live status**.
- No match means the stated time is used; it does **not** prove cancellation.
  Ryanair/easyJet callsign limitations still apply. No fuzzy place or flight
  guessing is used: inspect a mishearing and correct it.
- “About half six” is accepted and visibly marked approximate, then treated as
  the entered flight time. It does not create a fabricated uncertainty window.
- Replies pause recognition to prevent the app hearing itself, then listening
  resumes. Tap **Interrupt and listen** to cut a reply short. **Stop voice**,
  “stop listening”, or Escape stops voice. After a minute without an instruction,
  voice pauses. There is no wake word or always-on microphone.
- Use **Or type an instruction** in any browser; it runs the same parser and
  action validation. The original journey form is still available.

### Browser support and privacy

Recognition is feature-detected (`SpeechRecognition` / `webkitSpeechRecognition`),
with English (UK) selected. Chrome and Safari commonly expose this API, but support
varies across operating systems, installed PWAs, permissions and browser settings;
Firefox generally needs typed input. HTTPS (or localhost), microphone permission
and often an internet connection are required. Support is not a guarantee of
latency or accuracy, especially with cabin noise. See the
[Web Speech API documentation](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition).

**Your browser may send microphone audio off-device to its speech service.**
That service’s handling and retention follow its provider’s terms; SetoffIQ cannot
control them. This is disclosed above Start talking before microphone use. Type your
postcode or other sensitive details if you prefer to keep them out of speech.
SetoffIQ does not record, log or persist audio or transcripts, and sends no
transcript, postcode or coordinates to any language model. Voice parsing is local,
rule-based and independent of the optional Ollama explanation setting. Spoken
device replies use only voices the browser marks local; if none are available, the answer
remains on screen. **Read answer** can retry after voices load or when autoplay
restrictions require a tap. Only normal structured journey details are persisted
when monitoring is started, through the existing storage module.

Voice stops on tab hiding, page exit and screen lock when the browser dispatches
those lifecycle events; returning requires a fresh Start talking tap. Browser suspension
can interrupt recognition without a final transcript. Monitoring retains its
existing limitation: it works while the app is open, with a refresh on return.
No background voice or locked-screen reliability is promised.

### Remaining voice limitations

- The bounded English parser is not general conversation. Today/tomorrow/ISO
  dates, clock times, half/quarter times and common airlines work; unsupported
  date wording or unclear instructions need the controls. More languages and
  place aliases would need additional deterministic rules and test corpora.
- Browser recognition owns transcription speed and accuracy. Truly private,
  consistent offline dictation would require an on-device speech model and large
  downloads, with device-performance testing. No hosted transcription is added.
- Spoken barge-in during a reply is not enabled: interrupt with a tap, then speak.
  Reliable simultaneous listening/speaking would need tested echo cancellation
  across actual mobile devices. Replies and follow-ups otherwise need no new tap.
- Flight data remains incomplete, region-limited and refreshed best-effort. Better
  coverage would need a permitted, sustainably free feed or an explicit change to
  the project’s cost constraint. Voice cannot supply missing airline information.
- Real phone microphone, noisy-car, screen-reader speech and OS lock behaviour
  still require device testing; CI covers utterance strings and browser callbacks,
  not physical audio capture. Use the app while stationary.

**Repository documentation correction:** this checkout already supports optional
AirLabs schedule/timetable snapshots and CI-only provider keys (see
DATA-SOURCES.md and ARCHITECTURE.md). Older “no schedules” / “no keys anywhere”
statements above describe the earlier position-only version. The voice feature
adds no backend, accounts, credentials or metered services, and
preserves the £0-to-run / £0-to-use design.

### Natural, contextual replies

SetoffIQ prepares a British Kokoro voice (Emma) automatically. **Voice settings**
on the planning page offers a manual download or retry. It prepares automatically after the first page renders. A saved device-voice choice is respected; offline, Data Saver and reported slow connections defer the download. Expect roughly
115 MB of model/style files on CPU, or roughly 350 MB on supported GPUs, plus a ~22 MB speech runtime; the first download and
warm-up may take a few minutes. **Try natural voice** previews it without enabling
the microphone. **Use device voice** cancels loading/playback; **Remove voice
download** deletes the isolated model/style cache. Settings → **Clear all local
data** also removes these files. Browser-cached app/runtime assets may remain.

The choice is remembered through the normal SetoffIQ storage layer. Reopening a
planning page recreates the worker from cached model files, when the browser has
kept them. If files were evicted it downloads again. Until ready, replies use a
local browser voice, preferring British and enhanced voices. The UI identifies
which voice is actually speaking. Neither download nor synthesis blocks the
on-screen result. If the model is too slow, fails, or playback is blocked, the
app falls back to a local device voice and keeps the written answer.

Replies lead with the set-off time once, use spoken clock/date/range formatting,
and distinguish passenger readiness from terminal arrival. Late journeys retain
the engine's warning; low confidence is not spoken as certainty. “Why that time?”
explains the engine's exact journey range and airport allowances in plain language.
No model interprets the journey or rewrites any numbers. Kokoro converts that
already-determined text to audio only. Long replies are split into short sentences
so the model cannot silently truncate the end. Stop, Escape, corrections and tab
hiding cancel playback and discard obsolete audio; no generated audio is saved.

**Privacy:** Hugging Face receives your IP and requests for public model/style
files. Speech generation happens inside a browser worker: no reply text, postcode,
coordinates or microphone audio is uploaded to Kokoro or a hosted voice API.
Browser recognition may still send microphone audio to its own speech service,
as disclosed above. Model weights are cached separately from saved journeys and
cleared by the same Settings action. Cached weights are software assets, not
recordings. Kokoro/Transformers.js and the model use Apache-2.0 licences; see
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

Natural speech requires workers and WebAssembly, and enough memory for the model.
Chrome desktop download/playback/reload are checked; actual iOS/Android audio
policies, memory limits, noisy-car recognition and subjective voice quality need
physical-device/user testing. Small gaps can occur between spoken sentences on
slower devices. VoiceStudio's local API was considered, but requiring visitors to
install/run another app conflicts with the no-setup public phone experience.

### A calmer, voice-first interface

The homepage leads to **Plan with voice**. On a planning page, **Voice or text**
and **Use the form** show one input method at a time; switching to the form stops
the microphone. The original form retains its fields and behaviour. Results
keep the recommendation visible; the supporting timeline and source details are
under **Why this time?** and **Travel notes and data limits**.

The conversation asks for the next missing detail, including AM/PM or flight-time
clarification when needed. The microphone control changes from **Start talking**
to **Listening — stop**, **Checking your journey**, or **Interrupt and talk**.
Tap a value in **Your journey details** to correct it; applying a change runs the
same validated planning pipeline. **Edit journey**, **Explain this time**, and
**Start monitoring** sit together beneath the result. Extended instructions live
under **Voice help and privacy**; the microphone privacy disclosure stays visible.
Switching a completed plan to **Use the form** fills it with the current journey;
submitting returns to the result stage. The form's original validation is retained.

Routine spoken replies are shorter and help follows the current step. The first
result reads the engine's departure time, confidence and flight-data limitations;
the full windows remain on screen. Kokoro is synthesised speech, not a human
recording. No human-recorded prompt assets are included; adding them later would
require original or appropriately licensed recordings. Dynamic answers continue
to use local synthesis.

A short first-visit guide can be skipped and replayed from **How to use SetoffIQ**
in the footer. Its correction example runs through the real local parser without
creating a journey or saving the example. A small, lazy-loaded Lottie transition
honours reduced motion. Only the guide-dismissal preference is saved.

Voice now also understands **help**, **repeat that**, **edit details**, **start
again**, **open journeys**, **open settings**, and **go to home**. Navigation ends
the voice session; return to the planner and tap Start talking to resume. Multiple flight
choices are read aloud. Missing postcodes have a focused inline field, so sensitive
location information need not be spoken to the browser service.

Natural speech prepares automatically after the first render, without requesting
microphone access or autoplaying sound. The visible preparation notice and welcome
guide let visitors cancel and remember their choice. Automatic preparation is
skipped for a saved opt-out, offline mode, Data Saver, or a reported 2G/3G connection.
Browsers do not always expose connection type: an unreported mobile connection may
still download the model. Device speech and all text controls work while it loads.

### Booking time versus timetable time

Use the **Manchester local arrival/departure time on your airline booking**.
The weekly flight finder is a recurring timetable, not confirmation for your
travel date. Selecting one fills the flight and date; enter the booking time
separately. On a saved journey, **Correct flight time** changes the date/time,
keeps the journey history and recalculates the plan. The screen labels BST/GMT
and separates flight time from the recommended time to set off.

If the timetable disagrees, your saved booking time stays in place. Refreshing
the plan does not verify your booking with the airline. Other-airport times
inferred from duration are estimates. Always check your booking and airline
updates, especially around seasonal timetable changes.


### Arrival updates and aircraft callsigns

Saved pickups show the booking arrival beside the latest available estimate,
with its source and observation time. A position-based estimate is **at the
stand, including a taxi allowance**, not an official landing forecast. Fresh
observations can move the plan earlier or later; no improvement is guaranteed.

If the booking number does not match the aircraft (for example, Ryanair UK
RK1712 broadcasting RUK87AL), choose **Link aircraft callsign**. Verify the
callsign against that flight and date first. The link is saved only with this
browser's journey; it does not rename the ticket flight, and changing its
booking date clears the link. Remove it whenever unsure. Route, freshness and
different-day checks still apply.

Coverage is roughly 460 km around Manchester. Shared snapshots normally publish
about every 15 minutes, but can be delayed; pressing Check now cannot create a
new aircraft observation. Outside coverage or without a usable match, the app
uses available schedule information or the booking time. This is not worldwide,
second-by-second tracking, and there is no licensed Flightradar24 integration.
