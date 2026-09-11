# Costs

**Owner: £0. User: £0.**

Not "free tier, keep an eye on it". The stronger property this project was built
for: **there is no billing mechanism attached to anything in the stack**, so a
usage mistake, a traffic spike or a runaway loop cannot produce a bill. Nothing
here has a payment method on file to charge.

Verified 10 September 2026 against each provider's own documentation. See
[DATA-SOURCES.md](DATA-SOURCES.md) for links and detail.

## Every dependency

| Provider | Purpose | Cost | Billing risk | Terms |
| --- | --- | ---: | --- | --- |
| The OpenSky Network | Aircraft positions | **£0** | None — anonymous access, no account, no payment method | 400 credits/day anonymous |
| Open-Meteo | Weather | **£0** | None — no key, no account, no payment method | 10,000 calls/day, non-commercial, CC BY 4.0 |
| OSRM (FOSSGIS + project instances) | Driving times | **£0** | None — public instances, no key, no account | Fair use; no live traffic |
| postcodes.io | UK postcode → coordinates | **£0** | None — open service, no key, no account | MIT; ONS/OS open data |
| OpenStreetMap | Road network data | **£0** | None — open data | ODbL, attribution required and given |
| GitHub Pages | Hosting | **£0** | None — free for public repositories; over-quota results in throttling or an email, never a charge | 1 GB site, 100 GB/month soft |
| GitHub Actions | Build and snapshot job | **£0** | None — free for public repositories | Best-effort scheduling |
| Ollama | Optional local explanations | **£0** | None — open-source, runs on the user's own machine | Optional, off by default |
| npm dependencies | Build and runtime | **£0** | None | See `package.json`; all MIT/ISC/Apache-2.0 |

## The audit

Two questions were asked of every dependency before it went in.

**"Could this service ever charge me automatically?"**

No, for all of them. None has an account with a payment method attached. None
has a paid tier that a free tier silently overflows into. Exceeding a limit on
any of them results in a rejected request, throttling, or an email — never an
invoice.

**"Could a user trigger enough usage to create a cost?"**

No, and the architecture makes it structurally hard to even try. SetoffIQ is a
static site: every request to Open-Meteo, OSRM and postcodes.io comes from the
visitor's own browser and their own connection, against their own IP. There is
no shared server-side quota for a user to exhaust on the owner's behalf. Even
so, the app caches aggressively, deduplicates in-flight requests, rate-limits
per provider, backs off on failure, and widens its polling interval the further
away a flight is.

The one piece of shared usage is the OpenSky snapshot job, and it is bounded by
construction: a single scheduled workflow, four runs an hour, anonymous, against
a documented 400-credit daily allowance. Visitor traffic cannot increase it,
because visitors read a static file rather than calling the API.

## What was rejected, and why

| Considered | Rejected because |
| --- | --- |
| Commercial flight-status APIs (schedules, gates, delays) | Every one meters usage and can bill. This is the single biggest feature sacrificed to the £0 rule — hence the honest flight-data limitations in the README. |
| Google Maps / Mapbox routing and geocoding | Pay-as-you-go with automatic billing. |
| Hosted LLM APIs for explanations | Metered per token. The rule-based explanation is deterministic anyway, which is better for this use. |
| Serverless proxy for the OpenSky CORS problem | Would need a platform account, and most free tiers either require a card or overflow into paid. Solved with a scheduled Actions job and a static file instead. |
| Hosted database for saved journeys | Unnecessary and worse for privacy. Journeys belong in the browser. |
| SMS or hosted email notifications | Both cost money per message. Browser notifications are free and sufficient. |
| Hosted analytics | Costs money at volume, and privacy-first is part of the product. |

## Secrets

There are none. `.env.example` contains two commented-out variables, both for
the optional local model. No API key exists anywhere in this repository, which
is the most reliable way to ensure none leaks and none is billed.
