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
callsigns unrelated to the flight number on your ticket, so those will not match
a flight number you type, and some airlines vary their callsigns — the standing
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

Settings has a **Clear all local data** button that genuinely removes
everything, because every write goes through a single namespaced storage module.

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
| [TomTom Traffic Incidents](https://docs.tomtom.com/traffic-api/documentation/tomtom-orbis-maps/v2/traffic-incidents/incident-details) | Optional accidents, jams and roadworks | Keyed; one shared hourly request when enabled |
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
