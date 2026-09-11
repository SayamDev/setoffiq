import { useState } from 'react';
import { DEFAULT_AIRPORT } from '../domain/airports';
import { formatClock, formatRelative, parseLocalDateTime, todayInZone } from '../domain/time';
import type { JourneyInput, SavedJourney } from '../domain/types';
import { navigate } from '../app/router';
import { Badge, Button, Callout, Card, Field, ui } from '../components/ui';
import { FLIGHT_SCENARIOS } from '../services/flight';
import { apiUsage } from '../services/usage';
import { createJourney } from '../storage/journeys';
import { useNow } from '../hooks/useNow';
import styles from './ContentPages.module.css';
import pageStyles from './PlanPage.module.css';

/**
 * A development view. It exists so we can see how much traffic this browser
 * has sent to free public services, and so the failure paths can be shown
 * without waiting for a real flight to be cancelled.
 */
export function DiagnosticsPage({
  onSaveJourney,
}: {
  onSaveJourney: (journey: SavedJourney) => void;
}): React.JSX.Element {
  const airport = DEFAULT_AIRPORT;
  const now = useNow(15_000);
  const [scenarioId, setScenarioId] = useState(FLIGHT_SCENARIOS[1]!.id);
  const [postcode, setPostcode] = useState('M1 4BT');
  const usage = apiUsage.summarise(now);

  const runScenario = (): void => {
    const scenario = FLIGHT_SCENARIOS.find((candidate) => candidate.id === scenarioId)!;
    const date = todayInZone(now + 3 * 60 * 60_000, airport.timeZone);
    const scheduledTime =
      parseLocalDateTime(date, '18:20', airport.timeZone) ?? now + 3 * 60 * 60_000;

    const input: JourneyInput = {
      kind: 'pickup',
      airportIata: airport.iataCode,
      flightNumber: 'TEST123',
      scheduledTime,
      passengerRoute: 'international',
      terminalCode: 'T2',
      // Manchester city centre, so the demo does not need a real postcode lookup
      // to have happened first.
      origin: { latitude: 53.4794, longitude: -2.2453, label: postcode },
      pickupMode: 'short-stay',
      dropoffMode: null,
      scenarioId: scenario.id,
    };

    // The label stays generic because the scenario can be switched afterwards,
    // and a label naming the original state would go stale immediately.
    const journey = createJourney(`TEST SCENARIO — pickup at ${airport.iataCode}`, input, now);
    onSaveJourney(journey);
    navigate({ name: 'journey', id: journey.id });
  };

  return (
    <>
      <header className={pageStyles.header}>
        <h1 className={pageStyles.title}>Diagnostics</h1>
        <p className={pageStyles.subtitle}>
          Request counts for this browser, and clearly-labelled test scenarios.
        </p>
      </header>

      <Card>
        <h2>Requests from this browser</h2>
        <p className={ui.hint}>
          SetoffIQ is a static site: every request comes from your own browser and your own
          connection. This counter is here so we can check the app is not asking too much of free
          public services. Nothing on this page is sent anywhere.
        </p>

        {usage.length === 0 ? (
          <p style={{ marginTop: 'var(--space-4)' }}>No requests recorded yet in this browser.</p>
        ) : (
          <div className={styles.scroller} style={{ marginTop: 'var(--space-4)' }}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Provider</th>
                  <th scope="col">Last hour</th>
                  <th scope="col">Last 24 hours</th>
                  <th scope="col">Documented daily limit</th>
                  <th scope="col">Last success</th>
                  <th scope="col">Last failure</th>
                </tr>
              </thead>
              <tbody>
                {usage.map((entry) => (
                  <tr key={entry.provider}>
                    <th scope="row">{entry.provider}</th>
                    <td>{entry.requestsLastHour}</td>
                    <td>{entry.requestsLast24h}</td>
                    <td>
                      {entry.documentedDailyLimit
                        ? entry.documentedDailyLimit.toLocaleString('en-GB')
                        : 'Not published'}
                    </td>
                    <td>
                      {entry.lastSuccessAt
                        ? formatClock(entry.lastSuccessAt, airport.timeZone)
                        : '—'}
                    </td>
                    <td>
                      {entry.lastFailureAt ? (
                        <span title={formatRelative(entry.lastFailureAt, now)}>
                          {formatClock(entry.lastFailureAt, airport.timeZone)}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p style={{ marginTop: 'var(--space-4)' }}>
          <Button variant="secondary" onClick={() => apiUsage.reset()}>
            Reset counter
          </Button>
        </p>
      </Card>

      <Card>
        <h2>Test scenarios</h2>
        <Callout tone="warn">
          <p>
            <Badge tone="warn">Test data</Badge> Journeys created here use simulated flight
            information. They are labelled as test scenarios everywhere they appear and never mix
            with live data.
          </p>
        </Callout>

        <div className={ui.stackTight} style={{ marginTop: 'var(--space-4)' }}>
          <Field id="scenario" label="Scenario">
            <select
              id="scenario"
              className={ui.control}
              value={scenarioId}
              onChange={(event) => setScenarioId(event.target.value)}
            >
              {FLIGHT_SCENARIOS.map((scenario) => (
                <option key={scenario.id} value={scenario.id}>
                  {scenario.label} — {scenario.description}
                </option>
              ))}
            </select>
          </Field>

          <Field id="scenario-postcode" label="Label for the starting point">
            <input
              id="scenario-postcode"
              className={ui.control}
              value={postcode}
              onChange={(event) => setPostcode(event.target.value)}
            />
          </Field>

          <Button onClick={runScenario}>Create test journey</Button>
        </div>
      </Card>
    </>
  );
}
