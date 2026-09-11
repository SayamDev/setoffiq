# Data sources

Every external service SetoffIQ uses, what it actually provides, and its terms
as verified against the provider's own primary documentation.

**All entries verified: 10 September 2026, with aerodrome observations and the
road-data assessment added 11 September 2026.**

---

## The OpenSky Network

- **Official documentation:** https://openskynetwork.github.io/opensky-api/rest.html
- **Purpose:** Positions of aircraft currently in the air near Manchester.
- **Data returned:** ICAO 24-bit address, callsign, latitude, longitude,
  barometric and geometric altitude, ground speed, vertical rate, on-ground
  flag, time of last contact.
- **Authentication:** OAuth2 for registered access. SetoffIQ uses the anonymous
  endpoint, which requires no credentials.
- **Rate limit:** 400 credits per day anonymously; 4,000 for authenticated
  users. A bounding-box `/states/all` request costs a small number of credits.
- **Free-use conditions:** No payment method, no account, no billing mechanism.
- **Attribution:** "Aircraft position data from The OpenSky Network
  (opensky-network.org)" — shown in the application footer.

### The CORS constraint, and how it is handled

The REST API responds with `access-control-allow-origin:
https://opensky-network.org`. A browser on any other origin therefore cannot
call it, and no amount of client-side code changes that.

Rather than run a proxy server — infrastructure, and eventually a bill — a
scheduled GitHub Actions job calls the anonymous endpoint about four times an
hour and publishes the result as a static JSON file served from the same origin
as the app. Roughly 96 requests a day against a 400-credit allowance, from one
place, regardless of how many people use the site.

### What this genuinely provides, and what it does not

**Provides:** whether an aircraft broadcasting a given callsign is currently
airborne in the covered area, where it is, and an arrival estimate derived from
its distance and ground speed.

**Does not provide:** airline schedules, gate or terminal assignments, official
delay status, or anything at all about a flight that has not taken off yet.

The same snapshot powers the "pick from aircraft inbound now" assist on the
pickup form. That assist can only ever offer aircraft already in the air:
OpenSky's arrivals endpoint returns `404` anonymously and every commercial
schedule API meters usage, so "which flights land tomorrow" has no free answer.
The interface states this rather than letting someone discover it by finding
their flight missing.

SetoffIQ therefore asks the user for the scheduled time from their booking and
treats live position data as an improvement on it when available. When no
aircraft is found, the scheduled time is used unchanged and the interface says
so explicitly.

**Callsign matching is partial and the app admits it.** Aircraft broadcast ICAO
callsigns (`UAE21`) while tickets show IATA flight numbers (`EK21`). SetoffIQ
maps the airlines it can, including zero-padding variants. Ryanair and easyJet
broadcast alphanumeric callsigns unrelated to the flight number, so those cannot
be matched — no attempt is made to fake it.

- **Fallback:** the user's scheduled time, clearly labelled as such, with
  reduced confidence.

---

## NOAA Aviation Weather Center

- **Official documentation:** https://aviationweather.gov/data/api/
- **Purpose:** Conditions at the aerodrome itself — a different question from
  the forecast along the drive.
- **Data returned:** METAR observations (wind, visibility, cloud layers,
  temperature, altimeter, flight category) and TAF forecasts, by ICAO code.
- **Authentication:** None. No API key.
- **Rate limit:** None published. SetoffIQ fetches once per scheduled run.
- **Free-use conditions:** United States government data, in the public domain.
  No account, no payment method, no billing mechanism.
- **Attribution:** "Aerodrome observations from the NOAA Aviation Weather Center
  (aviationweather.gov)" — shown in the application footer.
- **CORS:** The API sends **no** `access-control-allow-origin` header — verified
  11 September 2026 — so a browser on another origin cannot call it. It is
  fetched by the scheduled job and published as a static file, the same pattern
  used for aircraft positions.
- **What it genuinely adds:** an observation of the airport rather than a
  forecast point some miles away, in the terms that govern how quickly arrivals
  are landed. Low visibility and low cloud genuinely reduce landing rates.
- **What it does not do:** predict a delay. SetoffIQ says poor conditions *can*
  slow arrivals and widens its uncertainty accordingly; it never claims to know
  a particular flight will be late.
- **Fallback:** the recommendation is calculated without an airport-conditions
  signal, and the table says it is unavailable.

---

## Road disruption and roadworks — assessed and not used

Live road disruption would be genuinely valuable, and three sources were
examined on 11 September 2026. None is currently used, for reasons worth
recording rather than glossing.

| Source | Finding |
| --- | --- |
| [National Highways closures API](https://api.data.nationalhighways.co.uk/) | Returns `401 {"message":"Invalid Subscription Key"}`. Requires registration and a subscription key. |
| [WebTRIS](https://webtris.nationalhighways.co.uk/api/swagger/ui/index) | Free, keyless and CORS-enabled — but it serves **MIDAS traffic-count sensor archives** (20,076 loop sites), not closures or incidents. It is the wrong dataset for this question. |
| [Street Manager](https://www.gov.uk/guidance/find-and-use-roadworks-data) | GOV.UK states plainly: "You need to create an account to access the roadworks API service." Registration required. |

**On keyed sources.** Requiring a key does not by itself rule a source out. A
key can be held in repository secrets and used by the scheduled job, exactly as
the flight and conditions snapshots work — the key never reaches a browser, and
no visitor is ever asked for one or charged anything. `deploy.yml` carries a
commented step showing where such a source would go.

Two things must be true before one is switched on:

1. **Its terms must be verified against the £0 rule.** Free registration is not
   the same as free at volume, and a source that can bill at scale fails the
   requirement that a usage mistake cannot create a cost.
2. **The app must be no worse without it.** Anyone forking this repository will
   not have the owner's key, so a keyed source can only ever add a signal — it
   can never become load-bearing.

### National Highways — terms verified 11 September 2026

The provider's own terms were checked rather than assumed, and it passes on all
four counts that matter here.

| Check | Finding |
| --- | --- |
| **Cost** | *"Whilst the Information is currently supplied to You without charge, NH reserves the right to charge for the supply of Information at a future date."* A minimum of **six months' notice** is committed to before any charge. There is no payment method on file, so nothing can bill automatically. |
| **Redistribution** | **Permitted.** *"You are free to: copy, publish, distribute and transmit the Information."* Publishing the snapshot as a static file alongside the app is within licence. |
| **Commercial use** | Permitted — *"exploit the Information commercially and non-commercially"*. Less restrictive than Open-Meteo. |
| **Rate limit** | *"The APIs have a rate limit of 10 calls per subscription key per minute."* A fifteen-minute schedule uses about 0.07% of that. |
| **Licence** | Open Government Licence 2.0 with National Highways amendments. |
| **Attribution** | Required verbatim by clause 20(a): **“Powered by National Highways’ Transport Data Feeds”** — typographic apostrophe included. SetoffIQ renders this beneath the signal table whenever the data is in use, and a test pins the exact string so a tidy-up cannot silently break the licence condition. |

### Licence clauses worth knowing

Read in full at the subscription screen. Four clauses bear on how SetoffIQ uses
this feed:

- **¶21(e)** prohibits *"any automated system, software or process to extract
  content and/or data, including trawling, data mining and screen scraping"*.
  Read literally this sits oddly beside an API issued with a subscription key
  for automated consumption, and whose own FAQ says *"it is your responsibility
  to call the API as frequently as appropriate"*. The reading taken here is that
  it targets scraping the website rather than authorised API use. It is recorded
  because it is genuinely ambiguous, not because it is settled.
- **¶17** permits immediate termination for abuse, explicitly including
  *"inadvertent disruption of NH's systems due to incorrect operation or design
  of Your interface"*. The snapshot job is built to stay comfortably clear of
  the limit rather than merely under it: at most three pages per closure type,
  six seconds apart, the two types fetched in sequence rather than in parallel,
  and a 429 treated as a hard failure that publishes nothing. Worst case is six
  requests spread across about thirty seconds, once every fifteen minutes —
  roughly 24 calls an hour against a documented limit of 600.
- **¶2** allows the licence to be revised at any time without notice, with
  continued use counting as acceptance. This is why the feed sits behind a
  provider interface and can be removed without touching the engine.
- **¶20(b)** requires NH's trademarks and branding to be respected. SetoffIQ
  displays the attribution text only and uses no National Highways logo.

### If National Highways ever announces charges

Clause 13 requires a minimum of six months' notice, sent to the registered
email, with the proposed charges. Nothing can bill silently: there is no payment
method on file and no billing mechanism in the licence.

If that notice arrives, **delete the `NATIONAL_HIGHWAYS_KEY` repository
secret.** The next scheduled run writes no file, the app returns to reporting
road disruption as "not checked", and nothing else in the product changes. That
is the whole migration path, and it is why this feed sits behind a provider
interface rather than being wired into the engine.

There is no penalty or indemnity clause in the licence. The remedies available
to NH under ¶14–17 are suspension or termination of supply.

The endpoint is `https://api.data.nationalhighways.co.uk/roads/v2.0/closures`,
confirmed to exist because it answers `401 Invalid Subscription Key` rather than
`404`.

### Status: built, not enabled

The integration exists and is tested — a provider, a normalisation layer, a
signal, journey-uncertainty weighting and a CI step. It is inert because no key
has been registered.

**To enable it:**

1. Register at
   [developer.data.nationalhighways.co.uk](https://developer.data.nationalhighways.co.uk/)
   and subscribe to the closures data service. This is an account creation, so
   it is the repository owner's to do.
2. Add the key as the repository secret **`NATIONAL_HIGHWAYS_KEY`**. Nothing
   else is needed — the endpoint and the required attribution are already
   defaulted in the script.
3. Push, or run the Deploy workflow manually. **The first run is the
   verification step.**

### The mapping is verified

The field mapping was written against the OpenAPI 3 definition and the sample
payloads published on the API's own documentation page, and is covered by
eleven tests in `src/services/roads/datex.test.ts` using those samples. It is
not guesswork awaiting a key.

The feed is DATEX II v3.4 with National Highways extensions:

```
D2Payload → situation[] → situationRecord[] → sit<RecordType>
  validity.validityStatus                       planned | active | suspended
  validity.validityTimeSpecification            overallStartTime / overallEndTime
  generalPublicComment[].comment
  locationReference
    locLocationGroupByList.locationContainedInGroup[]   many locations
    locLinearLocation                                   one location
      gmlLineString.locGmlLineString.posList   "lat lon lat lon …", EPSG::4326
    locSingleRoadLinearLocation …locLinearElementByCode.roadName
```

Three behaviours in this feed would produce wrong output if taken at face
value, and each is handled explicitly:

1. **`closureType` defaults to `planned`.** Requesting neither returns roadworks
   only and silently omits every live incident — the half a driver most needs.
   Both kinds are requested separately and merged, with live incidents winning
   on an id clash.
2. **Completed closures stay `active` for seven days after the works end.**
   Trusting the status alone would present week-old roadworks as current, so
   `overallEndTime` decides, not the status.
3. **The endpoint can serve XML.** `application/xml` is a valid response media
   type, so `X-Response-MediaType: application/json` is sent explicitly rather
   than relying on a default that could change.

Records that cannot be both named and placed are dropped rather than guessed
at, and any fetch error leaves the previous snapshot untouched — so the app
falls back to *"not checked"* rather than showing a driver a half-understood
closure.

**Coverage caveat:** National Highways operates the Strategic Road Network, so
the M56 and M60 around the airport are covered but local roads generally are
not. The signal is useful, not complete, and the app does not imply otherwise.

### What the live feed taught us

The first successful run returned 24 disruptions within 40 km, and two things
about it only became apparent with real data in hand.

**One set of works arrives as several records.** National Highways splits a
single closure across multiple `situationRecord` entries — one per lane, or per
time period — each with its own `idG`. Deduplicating on id let the same M67
lane closure through four times. The key is now the road, description and
rounded distance, because a driver cares that a lane is shut, not how the
publisher chose to model it.

**Routine roadworks are the normal state of the network, not an event.** All 24
were maintenance lane closures. Letting those widen the journey estimate would
put a permanent 6–12% penalty on every single recommendation, which is worse
than useless: a warning that is always on is not a warning. Only closures and
incidents that are currently *in force* move the number. Roadworks are still
reported — *"24 roadworks reported nearby, none currently closing a road"* —
they simply do not inflate the estimate.

**Until then**, the app reports road disruption as *"Not checked — every free UK
source for this requires a registered key. Absence of information here is not
evidence the roads are clear."* That distinction is deliberate and is covered by
a test: no data is not the same as no disruption.

Because the source is never configured rather than failing, it carries no
confidence penalty. Scoring every recommendation down for a limitation that is
always present would make the number meaningless.

---

## Open-Meteo

- **Official documentation:** https://open-meteo.com/en/docs
- **Terms:** https://open-meteo.com/en/terms
- **Purpose:** Hourly weather at the airport around the journey time.
- **Data returned:** temperature, precipitation, wind speed and gusts,
  visibility, WMO weather code.
- **Authentication:** None. No API key.
- **Rate limit:** 600 calls/minute, 5,000/hour, 10,000/day.
- **Free-use conditions:** The free API is for **non-commercial use**. SetoffIQ
  is a free, non-commercial, open-source project with no advertising and no paid
  tier, so this is satisfied. There is no payment method and no billing
  mechanism.
- **Licence:** CC BY 4.0.
- **Attribution:** "Weather data by Open-Meteo.com (CC BY 4.0)" — shown in the
  application footer.
- **Application usage:** One request per journey for a single day of hourly data
  at one point, cached for an hour by location and hour bucket. A monitored
  journey costs a handful of requests over its whole life.
- **Fallback:** The recommendation is calculated without a weather allowance,
  the weather card says it is unavailable, and confidence drops.

---

## OSRM

- **Official documentation:** https://project-osrm.org/docs/v5.24.0/api/
- **Instances used:**
  1. `https://routing.openstreetmap.de/routed-car` — operated by FOSSGIS; the
     instance openstreetmap.org itself uses.
  2. `https://router.project-osrm.org` — the OSRM project's demo server.
- **Purpose:** Driving duration and distance from the user's origin to the
  airport.
- **Authentication:** None.
- **Rate limit:** No published hard limit; both are shared community resources
  and ask for reasonable use. SetoffIQ enforces a minimum one second between
  requests, caches results for 24 hours keyed on rounded coordinates, and makes
  a single attempt per instance so a total outage fails quickly.
- **Free-use conditions:** No key, no account, no billing mechanism.
- **Attribution:** "Routing by OSRM, using map data from OpenStreetMap
  contributors (ODbL)" — shown in the application footer.
- **Important limitation:** OSRM returns **free-flow** driving times with no
  traffic model whatsoever. SetoffIQ never describes itself as traffic-aware.
  The routed time is used as the lower bound of the journey range, and the upper
  bound is widened for traffic, weekday peaks and weather.
- **Fallback:** the second instance, then a straight-line distance estimate with
  a road-winding factor, clearly flagged in the UI with reduced confidence.

---

## postcodes.io

- **Official documentation:** https://postcodes.io/docs
- **Purpose:** Turning a UK postcode into coordinates.
- **Data returned:** postcode, latitude, longitude, administrative district,
  country.
- **Authentication:** None.
- **Rate limit:** None published. SetoffIQ requests once on submit and caches
  for 90 days; postcode coordinates do not move.
- **Free-use conditions:** MIT-licensed and openly available. No key, no
  account, no billing mechanism.
- **Licence:** Data derived from ONS and Ordnance Survey open data, © Crown
  copyright and database right.
- **Attribution:** shown in the application footer.
- **Fallback:** the user is asked to check the postcode.

### Why there is no address search

Free-text address search would need a geocoder such as OSM Nominatim, whose
usage policy explicitly prohibits client-side autocomplete:

> "This is not yet supported by Nominatim and you must not implement such a
> service on the client side using the API."

It also caps all traffic from an application at one request per second in total.
Building autocomplete on it would breach the policy, so SetoffIQ asks for a
postcode — one request, on submit, then cached — and says why in the form.

---

## OpenStreetMap

- **Copyright:** https://www.openstreetmap.org/copyright
- **Purpose:** The underlying road network behind OSRM's routing.
- **Licence:** Open Database Licence (ODbL).
- **Attribution:** "map data from OpenStreetMap contributors (ODbL)" — shown in
  the application footer.

---

## Ollama (optional, local only)

- **Official documentation:** https://github.com/ollama/ollama
- **Purpose:** Optionally wording the explanation of a recommendation.
- **Authentication:** None; runs on the user's own machine.
- **Free-use conditions:** Open-source, local. No hosted service is involved and
  no data leaves the machine.
- **Application usage:** Off by default. The published site has no model behind
  it, and never contacts `localhost` to look for one: only a development build,
  or one built with `VITE_OLLAMA_URL`, checks whether a local model is running.
  A public page probing a visitor's loopback address prompts for local-network
  permission in Chrome, and Ollama's default origin policy would refuse
  `github.io` regardless. When enabled, the model receives only durations, times and windows — never
  an address, postcode or coordinate — and cannot change any of them.
- **Fallback:** the rule-based explanation, labelled honestly as such.

---

## SetoffIQ's own assumptions

These are **not** data from any provider. They are product assumptions, kept in
`src/domain/assumptions.ts` and `src/domain/airports/man.ts`, shown in the app
as assumptions, and documented on the "How SetoffIQ estimates time" page.

### Getting out of Manchester Airport

| Stage | Within the UK | International |
| --- | --- | --- |
| Leaving the aircraft | 5–12 min | 5–12 min |
| Border control | — | 8–25 min |
| Bags | 8–20 min | 5–18 min |
| Walking out | 5–10 min | 6–12 min |
| **Total** | **18–42 min** | **24–67 min** |

Baggage on international arrivals is counted as the wait *after* clearing border
control, because the belt is being loaded while passengers queue; adding both in
full would double-count.

### Journey uncertainty

| Factor | Added to the upper bound |
| --- | --- |
| Base (routing models an empty road) | +12% |
| Weekday peak hours (07–09, 16–18) | +15% |
| Moderate weather | +6% |
| Poor weather | +14% |
| No routing available at all | +35% |

### Time at the airport

| Pickup style | Allowance | Drop-off style | Allowance |
| --- | --- | --- | --- |
| Quick pickup | 4 min | Drop-off zone | 8 min |
| Short-stay parking | 12 min | Park and walk in | 18 min |
| Meet inside the terminal | 20 min | Park and see them off | 28 min |

### Check-in buffers for drop-offs

Domestic 90–120 minutes, international 120–180 minutes.

**Manchester Airport publishes no recommended arrival time.** Its FAQ, checked
10 September 2026, says only: *"Check-in times vary by flight type, so please
arrive with enough time to complete check-in and security."* These buffers are
therefore SetoffIQ's assumptions, and the app tells the user their airline sets
the actual deadlines.

### Arrival estimation from position

Vectoring factor 1.15 on remaining distance, 8 minutes of final approach,
6 minutes of taxi to the stand. An aircraft climbing faster than 4 m/s within
90 km of the airport is treated as departing, not arriving.

None of these figures are published airport statistics, and SetoffIQ never
presents them as such.
