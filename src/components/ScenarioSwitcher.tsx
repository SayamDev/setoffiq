import type { SavedJourney } from '../domain/types';
import { FLIGHT_SCENARIOS } from '../services/flight';
import { appendEvent } from '../storage/journeys';
import { Badge, Field, ui } from './ui';

/**
 * Only rendered for journeys that were created as test scenarios. Switching
 * scenario changes the simulated flight information and triggers a genuine
 * recalculation — the same code path a real change goes through.
 */
export function ScenarioSwitcher({
  journey,
  onSave,
}: {
  journey: SavedJourney;
  onSave: (journey: SavedJourney) => void;
}): React.JSX.Element | null {
  if (!journey.input.scenarioId) return null;

  const change = (scenarioId: string): void => {
    const scenario = FLIGHT_SCENARIOS.find((candidate) => candidate.id === scenarioId);
    if (!scenario) return;
    const updated = appendEvent(
      { ...journey, input: { ...journey.input, scenarioId } },
      'flight-updated',
      `Test scenario switched to "${scenario.label}".`,
    );
    // Saving is enough: the monitor re-checks whenever the scenario changes,
    // which keeps this on exactly the same path a real flight update takes.
    onSave(updated);
  };

  return (
    <div>
      <p style={{ marginBottom: 'var(--space-3)' }}>
        <Badge tone="warn">Test scenario — not live information</Badge>
      </p>
      <Field
        id="scenario-switch"
        label="Simulated flight state"
        hint="Changing this recalculates the recommendation exactly as a real change would."
      >
        <select
          id="scenario-switch"
          className={ui.control}
          value={journey.input.scenarioId}
          onChange={(event) => change(event.target.value)}
        >
          {FLIGHT_SCENARIOS.map((scenario) => (
            <option key={scenario.id} value={scenario.id}>
              {scenario.label}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}
