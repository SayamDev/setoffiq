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

Neither National Highways nor Street Manager has been registered or verified, so
neither is enabled. SetoffIQ does not claim to know about road disruption, and
the journey estimate widens its upper bound for traffic generally instead.

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
  it. When enabled, the model receives only durations, times and windows — never
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
