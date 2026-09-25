import { describeRoute } from '../domain/routeText';
import type { Instant, JourneyKind } from '../domain/types';
import { countryName, type FlightRoute } from '../services/flight';
import styles from './FlightRouteSummary.module.css';

/** Where the flight goes or comes from, and when it is there, in both clocks. */
export function FlightRouteSummary({
  route,
  kind,
  timeZone,
  now,
}: {
  route: FlightRoute;
  kind: JourneyKind;
  timeZone: string;
  now: Instant;
}): React.JSX.Element {
  const text = describeRoute({ ...route, countryName: countryName(route.country) }, kind, timeZone, now);
  return (
    <div className={styles.route}>
      <p className={styles.headline}>{text.headline}</p>
      {text.detail ? <p className={styles.detail}>{text.detail}</p> : null}
      <p className={styles.basis}>{text.basis}</p>
    </div>
  );
}

/** "to Rabat" / "from Dubai" — short enough for a list or a subtitle. */
export function shortRoute(route: FlightRoute | null | undefined, kind: JourneyKind): string | null {
  const place = route?.city ?? route?.iata ?? null;
  if (!place) return null;
  return `${kind === 'pickup' ? 'from' : 'to'} ${place}`;
}
