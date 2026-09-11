# Data sources

Every external service SetoffIQ uses, what it actually provides, and its terms
as verified against the provider's own primary documentation.

**All entries verified: 10 September 2026, with aerodrome observations, the
road-data assessment, and the move from OpenSky to adsb.lol and the Virtual
Radar Server routes added 11 September 2026.**

---

## adsb.lol — aircraft positions

- **Official documentation:** the API's OpenAPI description at
  https://api.adsb.lol/api/openapi.json, and
  https://www.adsb.lol/docs/open-data/api/
- **Purpose:** Positions of aircraft currently in the air near Manchester.
- **Endpoint:** `GET /v2/point/{lat}/{lon}/{radius}` — radius in nautical miles,
  up to 250. SetoffIQ asks for 162 nm (300 km) around EGCC.
- **Data returned:** readsb's JSON, the ADSBexchange v2 format — callsign,
  ICAO address, position, barometric and geometric altitude **in feet** (the
  string `"ground"` on the ground), ground speed **in knots**, track, climb rate
  **in feet per minute**, and seconds since the last position. The snapshot job
  converts to the metric units the app has always used
  (`scripts/lib/adsblol.mjs`, tested against a recorded response).
- **Authentication:** None. No key, no account.
- **Terms, verified 11 September 2026.** From the API's own description:
  *"You can use the API for free."* *"The license for the API as well as all
  data ADSB.lol makes public is ODbL."* Two notes in the same text are worth
  holding on to: *"In the future, you will require an API key which you can get
  by feeding to adsb.lol"*, and *"If you want to use the API for production
  purposes, please contact me so I do not break your application by
  accident."* The second is a courtesy, not a condition — worth doing.
- **Licence obligations (ODbL 1.0):** attribution, and share-alike for derived
  databases. The published snapshot is one, so it carries `"license":
  "ODbL-1.0"` and is offered under the same licence. Attribution — *"Aircraft
  data from adsb.lol (ODbL 1.0)"* — is in the application footer and on the
  Data sources page.
- **Rate limit:** none published. One request per scheduled run, about four an
  hour, from one place, however many people use the site.
- **Fallback:** the committed snapshot; and the app will not place an aircraft
  from a snapshot more than an hour old, using the scheduled time instead.

### Why a scheduled snapshot, not a browser call

The browser reads one static JSON file from the app's own origin. No visitor's
browser contacts a flight-data service, the request count is fixed by the
schedule rather than by traffic, and the same file carries the routes below.

### What this genuinely provides, and what it does not

**Provides:** whether an aircraft broadcasting a given callsign is currently
airborne in the covered area, where it is, which way it is heading, and an
arrival estimate derived from its distance and ground speed — plus, where one
is reported, its route.

**Does not provide:** airline schedules, gate or terminal assignments, official
delay status, or anything at all about a flight that has not taken off yet.

The same snapshot powers the "pick from aircraft inbound now" assist on the
pickup form. That assist can only ever offer aircraft already in the air; every
commercial schedule API meters usage, so "which flights land tomorrow" has no
free answer. The interface states this rather than letting someone discover it
by finding their flight missing.

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

### The OpenSky Network — used until 11 September 2026, then replaced

SetoffIQ first used OpenSky's anonymous `/states/all` endpoint. Its cost and
rate limits were checked (400 credits a day anonymously, no billing mechanism),
but its **terms of use** were not, and they rule this use out. From
https://opensky-network.org/about/terms-of-use, read on 11 September 2026:

> "Operational REST API use: Use of the REST API in any operational capacity —
> including integration into a live product, service, or automated system (even
> if only internal) — requires a previous written agreement, even for
> non-profit or governmental entities."

A scheduled job feeding a live app is exactly that, and being free,
non-commercial and anonymous does not exempt it. The same terms require any web
page using the data to cite Schäfer et al., *Bringing up OpenSky* (IPSN 2014),
and to send OpenSky a link. OpenSky's arrivals endpoint (`/flights/arrival`,
which would say which callsigns actually landed at Manchester) now returns
`403` anonymously, and is batch-updated overnight anyway.

The lesson is recorded because it is the easy one to miss: *free* and *allowed*
are separate questions, and only the first had been asked.

Alternatives checked the same day: **adsb.fi** works keyless but its terms say
*"adsb.fi open data is for personal, non-commercial use only"*, which a public
site used by others does not fit; **airplanes.live** returned `403`.

### Airline names in the inbound picker

The picker names each aircraft's operator from the three-letter ICAO
designator at the start of its callsign (`EZY` easyJet, `CFE` BA CityFlyer),
using a table in `src/services/flight/operators.ts`. The names were checked on
11 September 2026 against Wikipedia's current
[list of airline codes](https://en.wikipedia.org/wiki/List_of_airline_codes),
not OpenFlights' `airlines.dat`, which predates several reassignments — it
still gives `EAI` to a Togolese airline (now Emerald Airlines, flying as Aer
Lingus Regional) and `TOM` to Thomsonfly (now TUI Airways). An unknown
designator shows no name rather than a guess.

Freight-only operators (FedEx, UPS, DHL, West Atlantic and others) are left out
of the picker: nobody is collected from them.

### Where an aircraft is coming from — Virtual Radar Server standing data

- **Source:** https://github.com/vradarserver/standing-data — CSV files built
  from routes submitted by Virtual Radar Server users; refreshed daily (last
  commit checked: 11 September 2026, 03:49 UTC).
- **Licence:** **CC0 1.0** (public domain dedication), per the repository's
  licence. No attribution is required; SetoffIQ gives it anyway.
- **How it is used:** the deploy job keeps a shallow sparse clone of
  `routes/schema-01` and `airports/schema-01` (about 26 MB, 1,576 route files,
  ~620,000 routes), refreshed at most once a day and cached between runs. The
  snapshot job looks up each aircraft's callsign and records the leg that
  matters to Manchester: arriving here if the route stops here, otherwise first
  to last (`scripts/lib/routes.mjs`, tested). No visitor's browser contacts it.
- **What it changes:**
  - The inbound picker shows *"from Ibiza"* beside the airline.
  - An aircraft whose reported route ends somewhere else is not arriving here —
    it is left out of the picker, and a monitored journey says where it is
    reported to be going and uses the scheduled time. The first live sample
    showed how much this matters: the top three aircraft the picker offered
    were bound for Bristol, Luton and Belfast City.
- **Honesty about quality:** it is community-submitted, so the app calls a
  route *reported*, never *scheduled*. Airlines reuse alphanumeric callsigns
  across seasons and a submission can lag a change, so a route **to**
  Manchester does not exempt an aircraft from the height and heading checks.
- **Fallback:** no route; aircraft are judged on position alone.

**Not used for this:**

- **OpenSky's `origin_country`** is the aircraft's *country of registration*,
  not where the flight departed — an easyJet from Spain can read "Austria".
- **[adsbdb](https://github.com/mrjackwills/adsbdb)** has routes, but its README
  states: *"The flight route data is the work of David Taylor, Edinburgh and Jim
  Mason, Glasgow, and may not be copied, published, or incorporated into other
  databases without the explicit permission of David J Taylor, Edinburgh."*
  Republishing them in the snapshot would breach that.

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

## Road disruption and roadworks — National Highways

Live road disruption would be genuinely valuable, and three sources were
examined on 11 September 2026. None of them is free and keyless for this
question. National Highways' closures feed passed the checks below and has been
live since 11 September 2026, through a key held in repository secrets; the
other two are not used, for reasons worth recording rather than glossing.

| Source | Finding |
| --- | --- |
| [National Highways closures API](https://api.data.nationalhighways.co.uk/) | Returns `401 {"message":"Invalid Subscription Key"}` without a key. Requires registration and a subscription key. **Used**, via a repository secret. |
| [WebTRIS](https://webtris.nationalhighways.co.uk/api/swagger/ui/index) | Free, keyless and CORS-enabled — but it serves **MIDAS traffic-count sensor archives** (20,076 loop sites), not closures or incidents. It is the wrong dataset for this question. |
| [Street Manager](https://www.gov.uk/guidance/find-and-use-roadworks-data) | GOV.UK states plainly: "You need to create an account to access the roadworks API service." Registration required. |

**On keyed sources.** Requiring a key does not by itself rule a source out. A
key can be held in repository secrets and used by the scheduled job, exactly as
the flight and conditions snapshots work — the key never reaches a browser, and
no visitor is ever asked for one or charged anything. The road disruption step
in `deploy.yml` works exactly this way.

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

### Status: live since 11 September 2026

The integration is a provider, a normalisation layer, a signal,
journey-uncertainty weighting and a CI step. The `NATIONAL_HIGHWAYS_KEY`
repository secret was added on 11 September 2026, and every scheduled deploy
since has published `data/roads/EGCC-disruption.json` alongside the app.

**To enable it on a fork** (a fork does not have the owner's key):

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

### Without a key

A fork without the key, or a deployment after the secret is deleted, publishes
no road file. The app then reports road disruption as *"Not checked — every free
UK source for this requires a registered key. Absence of information here is not
evidence the roads are clear."* That distinction is deliberate and is covered by
a test: no data is not the same as no disruption.

A source that was never configured, as opposed to one that failed, carries no
confidence penalty. Scoring every recommendation down for a limitation that is
always present in that deployment would make the number meaningless.

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

Descending is not the same as descending *here*. A live watch on 11 September
2026 caught the inbound picker offering an easyJet that was landing at
Birmingham, and a monitored journey then timing a Manchester arrival from its
position 105 km away. Two checks now decide whether an aircraft can be
arriving at all:

- **Height.** A standard approach descends at 3°, about 52 m per km. More than
  10 km out and below 40% of that profile — judged on the higher of the GPS and
  barometric readings — it is landing somewhere else. This alone catches
  Liverpool, 40 km away, and Birmingham.
- **Heading.** More than 60 km out and pointing more than 120° away from the
  airport, it is not coming here yet. Heading is not judged closer in, where
  downwind legs and holding patterns legitimately point away for minutes at a
  time. The snapshot records each aircraft's `track` for this.

An aircraft on the ground more than 8 km away is at another airfield — often
its origin, before departure — and is no longer reported as landed.

When any check fails, the aircraft is left out of the picker, and a monitored
journey uses the scheduled time and says why. Both checks are SetoffIQ
judgements from geometry, not air-traffic information.

None of these figures are published airport statistics, and SetoffIQ never
presents them as such.
