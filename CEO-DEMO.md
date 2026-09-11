# SetoffIQ — demo script

Three to five minutes. **[https://sayamdev.github.io/setoffiq/](https://sayamdev.github.io/setoffiq/)**

> One line before you start: *"This is a free airport pickup and drop-off
> planner. It combines available flight, journey and weather information to
> recommend when you should set off, and updates that recommendation when
> circumstances change."*

---

## 1. The problem (20 seconds)

Open the home screen.

> "When you collect someone from an airport, the scheduled landing time is the
> wrong number to plan around. Between touchdown and them walking out there's
> taxiing, disembarkation, border control, a bag belt and a walk — routinely
> forty minutes, sometimes an hour. So people leave early and sit in a car park
> paying for parking, or they turn up on time and the passenger is stranded on a
> kerb."

Two choices, nothing else: **Pick someone up** / **Drop someone off**.

## 2. Enter a journey (40 seconds)

Choose **Pick someone up**.

- Airport: Manchester
- Date and scheduled arrival time — from the booking
- Flight number, e.g. an Emirates or KLM flight
- Starting postcode
- Pickup style: **Short-stay parking**

> "It asks for the scheduled time because no free data source gives airline
> schedules. It doesn't pretend otherwise — that honesty shapes the whole
> product."

**Calculate my journey.**

## 3. The recommendation (45 seconds)

> "One number, as big as it deserves to be."

Point at, in order:
- **Leave at HH:MM**
- **Passenger likely ready** — a *window*, not a promise
- **Arrive at airport**
- **Confidence**

> "It never says 'ready at 19:03'. It can't justify that, so it doesn't say it.
> A range you can plan around beats a precise number that's wrong."

## 4. Why this time (45 seconds)

Scroll to **What is driving this recommendation?**

> "Every factor is tagged with where it came from."

Point at the tags: **Live data**, **From you**, **Assumption**.

> "Live aircraft position. The time you entered. And our own assumptions about
> airport processing — labelled as assumptions, because Manchester doesn't
> publish those figures and we're not going to imply they did."

Then the explanation panel:

> "And a plain-English explanation. Note the label: 'Standard recommendation
> explanation. No AI model was involved.' It's generated from the same numbers
> the engine produced. If you run a local model it'll do the wording instead —
> but it only ever rewords. It never decides a time. That keeps the whole thing
> deterministic and testable."

## 5. The data it checked (30 seconds)

Scroll to **What SetoffIQ checked** — flight and weather cards.

> "Aircraft position, distance out, speed, callsign. Real weather at the
> airport. And every card carries its own timestamp — if something's stale it
> says so and confidence drops."

## 6. Monitoring and change detection (60 seconds)

Click **Monitor this journey**.

> "Saved to this browser. No account, nothing sent anywhere."

Then, to demonstrate a change reliably, go to **Diagnostics** in the footer.

> "I'll use a labelled test scenario rather than wait for a real flight to be
> delayed — it's simulated, and the app marks it as simulated everywhere it
> appears."

Create a test journey with **Delayed by 35 minutes**, then switch the simulated
state to **Early by 15 minutes**.

> "That's a genuine recalculation through exactly the same code path a real
> change takes."

Point at the change card:

> "Old time, new time, and *why*. Not 'flight updated' — that tells you nothing."

Then switch to **Cancelled**.

> "And when there's nothing sensible to recommend, it refuses to recommend
> anything and stops monitoring, rather than producing a confident number from
> nothing."

Scroll to **Activity** — the full audit trail.

## 7. The engineering (45 seconds)

> "Underneath: a provider layer with timeouts, retries, backoff, deduplication,
> caching and request counting. A pure prediction engine with no network, no
> clock and no UI in it — same inputs, same answer, ninety tests covering it
> including daylight-saving boundaries and every failure path.
>
> Weather goes down, you still get a recommendation without a weather
> allowance. Routing goes down, it estimates from distance and tells you. No
> single provider can take it down."

## 8. Cost and privacy (30 seconds)

> "Owner pays zero, user pays zero — and not 'free tier, watch your usage'.
> Nothing in the stack has a payment method attached, so a mistake *can't*
> produce a bill.
>
> The interesting constraint was flight data. OpenSky blocks browser requests
> from other origins, so instead of running a proxy — infrastructure, and
> eventually a bill — a scheduled GitHub Action calls it anonymously and
> publishes a static snapshot. Ninety-six requests a day against a
> four-hundred-credit allowance, no matter how many people use the site.
>
> And everything personal stays in the browser. There's no server to hold it."

## Closing

> "A real problem, real data, an honest answer, and it costs nothing to run."

---

## Notes for the presenter

- **Never claim live tracking for a flight that hasn't taken off.** OpenSky
  gives positions, not schedules.
- **Ryanair and easyJet flight numbers will not match a callsign.** Use an
  airline whose callsign maps cleanly — BA, KLM, Emirates, Lufthansa — or use a
  test scenario.
- **If the demo flight isn't airborne**, the app falls back to the scheduled
  time. That is correct behaviour and worth pointing out rather than hiding.
- **Always say when a scenario is simulated.** The app labels it; say it out
  loud too. Honesty is more impressive than fake realism.
