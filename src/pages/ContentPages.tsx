import { MANCHESTER } from '../domain/airports';
import { ARRIVAL_ESTIMATE } from '../services/flight';
import { JOURNEY_UNCERTAINTY } from '../domain/assumptions';
import { formatMinuteRange, addRanges } from '../domain/time';
import { Card } from '../components/ui';
import styles from './ContentPages.module.css';
import pageStyles from './PlanPage.module.css';

const VERIFIED = '10–11 September 2026';

export function AboutPage(): React.JSX.Element {
  return (
    <>
      <header className={pageStyles.header}>
        <h1 className={pageStyles.title}>About SetoffIQ</h1>
        <p className={pageStyles.subtitle}>Know when to set off. Know when to wait.</p>
      </header>

      <Card>
        <div className={styles.prose}>
          <h2>What SetoffIQ does</h2>
          <p>
            SetoffIQ turns a flight, a starting postcode and a few choices into one answer: what
            time to leave. For a pickup it works back from when your passenger is realistically
            going to walk out of the terminal. For a drop-off it works back from the departure time.
          </p>

          <h2>What data it uses</h2>
          <ul>
            <li>
              <strong>Aircraft positions</strong> from adsb.lol, via a snapshot refreshed on a
              schedule. This shows whether an aircraft broadcasting your flight's callsign is
              currently in the air near Manchester, and — where one is reported — its route.
            </li>
            <li>
              <strong>Weather</strong> at the airport from Open-Meteo, used to widen the journey
              estimate when conditions are likely to slow traffic.
            </li>
            <li>
              <strong>Driving times</strong> from OSRM over OpenStreetMap data.
            </li>
            <li>
              <strong>Your postcode</strong>, converted to a location by postcodes.io.
            </li>
          </ul>

          <h2>What it estimates</h2>
          <p>
            How long it takes to get off an aircraft, through border control, to a bag and out of
            the terminal. How much longer a drive might take than a routing engine's free-flow
            time. These are SetoffIQ's own assumptions, labelled as assumptions wherever they
            appear.
          </p>

          <h2>What it cannot guarantee</h2>
          <ul>
            <li>Airline schedules. SetoffIQ has no access to them and does not claim to.</li>
            <li>Live traffic. The routing data models an empty road.</li>
            <li>Queue lengths at border control, security or a bag belt.</li>
            <li>Parking availability or prices.</li>
            <li>
              Monitoring while your browser is closed. SetoffIQ runs entirely in the browser, so it
              checks while it is open and again when you reopen it.
            </li>
          </ul>

          <h2>Who operates it</h2>
          <p>
            SetoffIQ is an independent, open-source project. It is not affiliated with any airline
            or airport, and it does not imply official airport status. It is free to use, has no
            account and shows no advertising.
          </p>
        </div>
      </Card>
    </>
  );
}

export function EstimatesPage(): React.JSX.Element {
  const domestic = MANCHESTER.processingProfiles.find((p) => p.route === 'domestic')!;
  const international = MANCHESTER.processingProfiles.find((p) => p.route === 'international')!;
  const domesticTotal = addRanges(
    domestic.disembarkation,
    domestic.borderControl,
    domestic.baggage,
    domestic.terminalWalk,
  );
  const internationalTotal = addRanges(
    international.disembarkation,
    international.borderControl,
    international.baggage,
    international.terminalWalk,
  );

  return (
    <>
      <header className={pageStyles.header}>
        <h1 className={pageStyles.title}>How SetoffIQ estimates time</h1>
        <p className={pageStyles.subtitle}>
          Every number the app shows either came from somewhere, or is an assumption written down
          here.
        </p>
      </header>

      <Card>
        <div className={styles.prose}>
          <h2>The pickup calculation</h2>
          <p>
            Landing time, plus how long it takes to get out of the airport, gives a window in which
            your passenger is likely to be ready. From the earliest end of that window, SetoffIQ
            subtracts the time you need at the airport and then the <em>slowest</em> plausible
            drive. That is your departure time.
          </p>
          <p>
            Using the slow end of the drive is the point. It means your worst case lands on your
            passenger's best case: you are rarely early enough to sit waiting, and rarely late
            enough that they do.
          </p>

          <h2>Getting out of the airport</h2>
          <p>
            These are SetoffIQ's assumptions for {MANCHESTER.name}. The airport does not publish
            per-passenger processing times, so nothing here is an airport statistic.
          </p>
          <div
            className={styles.scroller}
            role="region"
            aria-label="Getting out of the airport"
            tabIndex={0}
          >
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Stage</th>
                  <th scope="col">Within the UK</th>
                  <th scope="col">International</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Leaving the aircraft</th>
                  <td>{formatMinuteRange(domestic.disembarkation)}</td>
                  <td>{formatMinuteRange(international.disembarkation)}</td>
                </tr>
                <tr>
                  <th scope="row">Border control</th>
                  <td>{formatMinuteRange(domestic.borderControl)}</td>
                  <td>{formatMinuteRange(international.borderControl)}</td>
                </tr>
                <tr>
                  <th scope="row">Bags</th>
                  <td>{formatMinuteRange(domestic.baggage)}</td>
                  <td>{formatMinuteRange(international.baggage)}</td>
                </tr>
                <tr>
                  <th scope="row">Walking out</th>
                  <td>{formatMinuteRange(domestic.terminalWalk)}</td>
                  <td>{formatMinuteRange(international.terminalWalk)}</td>
                </tr>
                <tr>
                  <th scope="row">Total</th>
                  <td>{formatMinuteRange(domesticTotal)}</td>
                  <td>{formatMinuteRange(internationalTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            Baggage is counted as the wait after clearing border control, because the belt is being
            loaded while people queue. Adding both in full would double-count.
          </p>

          <h2>The drive</h2>
          <p>
            OSRM returns free-flow driving times: what the road would take if nothing was in the
            way. SetoffIQ uses that as the fast end of the range and widens the slow end by{' '}
            {Math.round(JOURNEY_UNCERTAINTY.baseFraction * 100)}% for ordinary traffic, a further{' '}
            {Math.round(JOURNEY_UNCERTAINTY.peakFraction * 100)}% in weekday peak hours, and more
            again in poor weather. If no routing service answers at all, the estimate falls back to
            straight-line distance and is widened by{' '}
            {Math.round(JOURNEY_UNCERTAINTY.noRoutingFraction * 100)}% — and the app says so.
          </p>

          <h2>The flight</h2>
          <p>
            When an aircraft broadcasting your flight's callsign is visible in the covered area,
            SetoffIQ estimates arrival from its distance and ground speed, allowing for the fact
            that arrivals are vectored onto an approach rather than flown point to point, plus{' '}
            {ARRIVAL_ESTIMATE.taxiMinutes} minutes of taxiing to the stand. It knows nothing about
            holding stacks, runway configuration or air-traffic sequencing — which is exactly why
            the result feeds a window rather than a promised time.
          </p>
          <p>
            When no aircraft is found, SetoffIQ uses the scheduled time you entered, unchanged, and
            says that is what it is doing.
          </p>

          <h2>Why ranges, not single times</h2>
          <p>
            "Ready at 19:03" would be a more confident-sounding answer and a worse one. Flights
            taxi, bags are slow, roads back up. A range you can plan around is more useful than a
            precise number that is wrong.
          </p>
        </div>
      </Card>
    </>
  );
}

export function DataSourcesPage(): React.JSX.Element {
  return (
    <>
      <header className={pageStyles.header}>
        <h1 className={pageStyles.title}>Data sources</h1>
        <p className={pageStyles.subtitle}>
          Every external service SetoffIQ uses, what it provides, and the terms it was checked
          against on {VERIFIED}.
        </p>
      </header>

      <Card>
        <div className={styles.scroller} role="region" aria-label="Data sources" tabIndex={0}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Provider</th>
                <th scope="col">Provides</th>
                <th scope="col">Terms and limits</th>
                <th scope="col">If it fails</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">
                  <a href="https://www.adsb.lol/" rel="noreferrer noopener">
                    adsb.lol
                  </a>
                </th>
                <td>Positions of aircraft currently in the air near Manchester.</td>
                <td>
                  Free and keyless, published under the Open Database Licence (ODbL 1.0), which
                  permits republishing with attribution. Read from a scheduled snapshot, about four
                  times an hour, so your browser never calls it. No billing mechanism.
                </td>
                <td>The scheduled time you entered is used, and the app says so.</td>
              </tr>
              <tr>
                <th scope="row">
                  <a href="https://github.com/vradarserver/standing-data" rel="noreferrer noopener">
                    Virtual Radar Server standing data
                  </a>
                </th>
                <td>The route reported for each callsign, such as Ibiza to Manchester.</td>
                <td>
                  Public domain (CC0). Submitted by the Virtual Radar Server community, so a route is
                  "reported", never a schedule, and can lag a change.
                </td>
                <td>Aircraft are shown without a route, and judged on position alone.</td>
              </tr>
              <tr>
                <th scope="row">
                  <a href="https://airlabs.co/" rel="noreferrer noopener">
                    AirLabs
                  </a>
                </th>
                <td>
                  Manchester's arrivals and departures for the next ten hours, with delays and
                  cancellations.
                </td>
                <td>
                  Free plan with no payment details, under a key used only by the scheduled job.
                  About 1,000 requests a month, so it is refreshed every four and a half hours and
                  its status can be that old.
                </td>
                <td>
                  The lists fall back to flights SetoffIQ has seen on recent days, and monitoring to
                  live positions.
                </td>
              </tr>
              <tr>
                <th scope="row">
                  <a href="https://aviationweather.gov/data/api/" rel="noreferrer noopener">
                    NOAA Aviation Weather Center
                  </a>
                </th>
                <td>Conditions at the airport itself, from the aerodrome observation.</td>
                <td>
                  United States government data, in the public domain. No key and no billing
                  mechanism. It sends no CORS header, so SetoffIQ reads a scheduled snapshot rather
                  than calling it from your browser.
                </td>
                <td>The recommendation is calculated without an airport-conditions signal.</td>
              </tr>
              <tr>
                <th scope="row">
                  <a href="https://open-meteo.com/" rel="noreferrer noopener">
                    Open-Meteo
                  </a>
                </th>
                <td>Hourly weather at the airport.</td>
                <td>
                  No API key. 600 calls a minute, 5,000 an hour and 10,000 a day, for
                  non-commercial use, under CC BY 4.0. No billing mechanism. Responses are cached
                  for an hour.
                </td>
                <td>The recommendation is calculated without a weather allowance.</td>
              </tr>
              <tr>
                <th scope="row">
                  <a href="https://project-osrm.org/" rel="noreferrer noopener">
                    OSRM
                  </a>
                </th>
                <td>Driving time and distance over OpenStreetMap data.</td>
                <td>
                  Public instances operated by FOSSGIS and the OSRM project. No key, no billing.
                  Requests are rate-limited to one a second and cached for a day. No live traffic
                  data.
                </td>
                <td>The drive is estimated from straight-line distance, with lower confidence.</td>
              </tr>
              <tr>
                <th scope="row">
                  <a href="https://postcodes.io/" rel="noreferrer noopener">
                    postcodes.io
                  </a>
                </th>
                <td>UK postcode to coordinates.</td>
                <td>
                  MIT-licensed and free, built on ONS and Ordnance Survey open data. No key, no
                  billing. Looked up only on submit, then cached.
                </td>
                <td>You are asked to check the postcode.</td>
              </tr>
              <tr>
                <th scope="row">
                  <a href="https://www.openstreetmap.org/copyright" rel="noreferrer noopener">
                    OpenStreetMap
                  </a>
                </th>
                <td>The underlying road network.</td>
                <td>Open Database Licence. Attribution shown in the footer.</td>
                <td>Not applicable.</td>
              </tr>
              <tr>
                <th scope="row">Ollama (optional)</th>
                <td>Wording for the explanation, if you run one locally.</td>
                <td>
                  Runs on your own machine. Off by default, and the published site has no model
                  behind it.
                </td>
                <td>The standard explanation is used instead.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <div className={styles.prose}>
          <h2>What SetoffIQ deliberately does not use</h2>
          <ul>
            <li>
              <strong>Commercial flight-status APIs.</strong> They would give schedules and gate
              information, and every one of them meters usage and can generate a bill.
            </li>
            <li>
              <strong>Address autocomplete.</strong> The open geocoder that would allow it asks
              applications not to implement client-side autocomplete against it, so SetoffIQ asks
              for a postcode instead.
            </li>
            <li>
              <strong>Live road closures and roadworks.</strong> The National Highways closures
              feed and the Street Manager roadworks API both require a registered key, and the one
              free keyless National Highways service — WebTRIS — serves historical traffic-sensor
              archives rather than closures. SetoffIQ therefore does not claim to know about road
              disruption; the journey estimate widens its upper bound for traffic generally
              instead.
            </li>
            <li>
              <strong>Analytics and trackers.</strong> None, by design.
            </li>
          </ul>
        </div>
      </Card>
    </>
  );
}

export function PrivacyPage(): React.JSX.Element {
  return (
    <>
      <header className={pageStyles.header}>
        <h1 className={pageStyles.title}>Privacy</h1>
        <p className={pageStyles.subtitle}>
          SetoffIQ keeps saved journey information on your device wherever possible.
        </p>
      </header>

      <Card>
        <div className={styles.prose}>
          <h2>What stays on your device</h2>
          <p>
            Saved journeys, the postcode you set off from, flight numbers, journey labels, your
            settings, cached routes and weather, and the local counter of how many requests this
            browser has made. All of it is in this browser's storage. There is no account and no
            server holding any of it.
          </p>

          <h2>What leaves your device</h2>
          <ul>
            <li>
              Your postcode is sent to postcodes.io once, to turn it into a location. The result is
              cached so it is not sent again.
            </li>
            <li>
              The airport's coordinates and your starting coordinates are sent to a public OSRM
              instance to calculate the drive.
            </li>
            <li>The airport's coordinates are sent to Open-Meteo for the weather.</li>
            <li>
              The flight position snapshot is a static file downloaded from the same place as the
              app itself. Nothing about you is sent to request it.
            </li>
          </ul>

          <h2>Explanations and AI</h2>
          <p>
            The explanation of your recommendation never includes your address, postcode or
            coordinates — the drive is described only as a duration. If you switch on the optional
            local model, that information goes to software running on your own machine and nowhere
            else. The published site has no model behind it.
          </p>

          <h2>No tracking</h2>
          <p>
            SetoffIQ has no analytics, no advertising, no session recording and no third-party
            trackers.
          </p>

          <h2>Removing everything</h2>
          <p>
            Settings has a "Clear all local data" button that removes every piece of SetoffIQ data
            from this browser.
          </p>

          <h2>Disclaimer</h2>
          <p>
            SetoffIQ provides estimates for planning purposes. Flight times, passenger processing,
            traffic and weather may change. Allow appropriate additional time and follow official
            airport and airline guidance.
          </p>
        </div>
      </Card>
    </>
  );
}
