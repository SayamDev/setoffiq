import { AppShell } from './app/AppShell';
import { useRoute } from './app/router';
import { HomePage } from './pages/HomePage';
import { PlanPage } from './pages/PlanPage';
import { JourneyPage } from './pages/JourneyPage';
import { JourneysPage } from './pages/JourneysPage';
import { SettingsPage } from './pages/SettingsPage';
import { DiagnosticsPage } from './pages/DiagnosticsPage';
import { AboutPage, DataSourcesPage, EstimatesPage, PrivacyPage } from './pages/ContentPages';
import { useJourneys } from './hooks/useJourneys';
import { useSettings } from './hooks/useSettings';

export default function App(): React.JSX.Element {
  const route = useRoute();
  const { journeys, save, remove, clear } = useJourneys();
  const { settings, update } = useSettings();

  return (
    <AppShell route={route} theme={settings.theme} onThemeChange={(theme) => update({ theme })}>
      {route.name === 'home' ? <HomePage /> : null}

      {route.name === 'plan' ? (
        <PlanPage
          key={route.kind}
          kind={route.kind}
          onSaveJourney={save}
          useLocalModel={settings.useLocalModel}
        />
      ) : null}

      {route.name === 'journeys' ? <JourneysPage journeys={journeys} /> : null}

      {route.name === 'journey' ? (
        <JourneyPage
          key={route.id}
          journey={journeys.find((journey) => journey.id === route.id) ?? null}
          settings={settings}
          onSave={save}
          onDelete={remove}
        />
      ) : null}

      {route.name === 'settings' ? (
        <SettingsPage settings={settings} onUpdate={update} onClearJourneys={clear} />
      ) : null}

      {route.name === 'about' ? <AboutPage /> : null}
      {route.name === 'estimates' ? <EstimatesPage /> : null}
      {route.name === 'data-sources' ? <DataSourcesPage /> : null}
      {route.name === 'privacy' ? <PrivacyPage /> : null}
      {route.name === 'diagnostics' ? <DiagnosticsPage onSaveJourney={save} /> : null}
    </AppShell>
  );
}
