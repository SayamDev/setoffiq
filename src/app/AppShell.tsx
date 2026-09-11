import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { OPEN_METEO_ATTRIBUTION } from '../services/weather';
import { OSRM_ATTRIBUTION, POSTCODES_ATTRIBUTION } from '../services/routing';
import { FLIGHT_DATA_ATTRIBUTION } from '../services/flight';
import { AWC_ATTRIBUTION } from '../services/conditions';
import { ThemeToggle } from '../components/ThemeToggle';
import { Wordmark } from '../components/Wordmark';
import type { ThemeChoice } from '../storage/settings';
import { hrefFor, type Route } from './router';
import styles from './AppShell.module.css';

const NAV: { label: string; route: Route }[] = [
  { label: 'Plan', route: { name: 'home' } },
  { label: 'Journeys', route: { name: 'journeys' } },
  { label: 'Settings', route: { name: 'settings' } },
];

function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = (): void => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

export function AppShell({
  route,
  children,
  theme,
  onThemeChange,
}: {
  route: Route;
  children: ReactNode;
  theme: ThemeChoice;
  onThemeChange: (theme: ThemeChoice) => void;
}): React.JSX.Element {
  const online = useOnline();

  return (
    <div className={styles.page}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <header className={styles.header}>
        <div className={styles.headerInner}>
          <a className={styles.brand} href={hrefFor({ name: 'home' })}>
            <Wordmark />
          </a>
          <div className={styles.headerControls}>
            <nav className={styles.nav} aria-label="Main">
            {NAV.map((item) => (
              <a
                key={item.label}
                className={route.name === item.route.name ? styles.navLinkActive : styles.navLink}
                href={hrefFor(item.route)}
                aria-current={route.name === item.route.name ? 'page' : undefined}
              >
                {item.label}
              </a>
              ))}
            </nav>
            <ThemeToggle theme={theme} onChange={onThemeChange} />
          </div>
        </div>
      </header>

      {!online ? (
        <p className={styles.offline} role="status">
          You are offline. Saved journeys still work, but flight, weather and routing information
          cannot be updated.
        </p>
      ) : null}

      <main className={styles.main} id="main">
        {children}
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <nav className={styles.footerLinks} aria-label="About SetoffIQ">
            <a href={hrefFor({ name: 'about' })}>About</a>
            <a href={hrefFor({ name: 'estimates' })}>How SetoffIQ estimates time</a>
            <a href={hrefFor({ name: 'data-sources' })}>Data sources</a>
            <a href={hrefFor({ name: 'privacy' })}>Privacy</a>
            <a href={hrefFor({ name: 'diagnostics' })}>Diagnostics</a>
            <a href="https://github.com/sayamdev/setoffiq">Source code</a>
          </nav>

          <div className={styles.attribution}>
            <span>{FLIGHT_DATA_ATTRIBUTION}</span>
            <span>{AWC_ATTRIBUTION}</span>
            <span>{OPEN_METEO_ATTRIBUTION}</span>
            <span>{OSRM_ATTRIBUTION}</span>
            <span>{POSTCODES_ATTRIBUTION}</span>
          </div>

          <p className={styles.disclaimer}>
            SetoffIQ is an independent travel-planning application and is not affiliated with any
            airline or airport. Estimates are for planning only — follow official airport and
            airline guidance.
          </p>
        </div>
      </footer>
    </div>
  );
}
