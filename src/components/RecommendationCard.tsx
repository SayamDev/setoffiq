import { advisoryAt } from '../domain/engine';
import { formatClock, formatClockRange, formatDate, formatMinuteRange } from '../domain/time';
import { shortOtherEnd } from '../domain/routeText';
import type { AdvisoryKind, AirportProfile, Instant, Recommendation } from '../domain/types';
import type { FlightRoute } from '../services/flight';
import { ConfidenceBadge } from './ConfidenceBadge';
import styles from './RecommendationCard.module.css';

/** The signal bar restates the advisory, which is always also written out. */
const SIGNAL_CLASS: Record<AdvisoryKind, string> = {
  'leave-now': styles.signalGo!,
  wait: styles.signalWait!,
  plan: styles.signalWait!,
  'get-ready': styles.signalReady!,
  'running-late': styles.signalLate!,
  blocked: styles.signalLate!,
};

/**
 * The screen the whole product exists for.
 *
 * Reading order is fixed and deliberate: the departure time, what to do about
 * it, then the three numbers that qualify it, then how much to trust it.
 */
export function RecommendationCard({
  recommendation,
  airport,
  now,
  flight,
  children,
}: {
  recommendation: Recommendation;
  airport: AirportProfile;
  now: Instant;
  /**
   * Which flight this is for, where it goes, and the terminal — said on the
   * card itself, so the one thing everyone reads also says what it is about.
   */
  flight?: {
    number: string | null;
    route: FlightRoute | null;
    terminal: { code: string; source: 'booking' | 'timetable' } | null;
  };
  children?: React.ReactNode;
}): React.JSX.Element {
  const zone = airport.timeZone;
  const sameDay = formatDate(recommendation.recommendedDeparture, zone) === formatDate(now, zone);
  // Rederived as the clock moves: the stored advisory is only as fresh as the
  // last check, and "get ready" goes on being shown long after it stops being true.
  const advisory = advisoryAt(recommendation, now, zone);

  return (
    <section className={styles.card} aria-labelledby="recommendation-heading">
      <div className={SIGNAL_CLASS[advisory.kind]} aria-hidden="true" />

      <div className={styles.head}>
        <p className={styles.eyebrow} id="recommendation-heading">
          Set off at
        </p>
        <div className={styles.confidence}>
          <ConfidenceBadge confidence={recommendation.confidence} />
        </div>
      </div>

      {flight && (flight.number || flight.route || flight.terminal) ? (
        <FlightStrip flight={flight} kind={recommendation.kind} airport={airport} />
      ) : null}

      <div className={styles.body}>
        <div className={styles.timeBlock}>
          <p className={styles.time}>{formatClock(recommendation.recommendedDeparture, zone)}</p>
          <p className={styles.day}>
            {sameDay ? 'Today' : formatDate(recommendation.recommendedDeparture, zone)} ·{' '}
            {airport.iataCode} time
          </p>
        </div>

        <div className={styles.advice}>
          <p className={styles.adviceHeadline}>{advisory.headline}</p>
          <p className={styles.adviceDetail}>{advisory.detail}</p>
        </div>
      </div>

      <dl className={styles.details}>
        {recommendation.kind === 'pickup' ? (
          <div>
            <dt className={styles.term}>Passenger likely ready</dt>
            <dd className={styles.value}>
              {formatClockRange(recommendation.readiness.window, zone)}
            </dd>
          </div>
        ) : (
          <div>
            <dt className={styles.term}>At the terminal</dt>
            <dd className={styles.value}>
              {formatClockRange(recommendation.terminalArrivalWindow, zone)}
            </dd>
          </div>
        )}

        <div>
          <dt className={styles.term}>Arrive at airport</dt>
          <dd className={styles.value}>
            {formatClockRange(recommendation.airportArrivalWindow, zone)}
          </dd>
        </div>

        <div>
          <dt className={styles.term}>Journey</dt>
          <dd className={styles.value}>{formatMinuteRange(recommendation.journey)}</dd>
        </div>
      </dl>

      {children ? <div className={styles.footer}>{children}</div> : null}
    </section>
  );
}

function FlightStrip({
  flight,
  kind,
  airport,
}: {
  flight: NonNullable<Parameters<typeof RecommendationCard>[0]['flight']>;
  kind: Recommendation['kind'];
  airport: AirportProfile;
}): React.JSX.Element {
  const place = flight.route?.city ?? flight.route?.iata ?? null;
  const when = flight.route ? shortOtherEnd(flight.route, kind, airport.timeZone) : null;
  const terminal = flight.terminal
    ? (airport.terminals.find((one) => one.code === flight.terminal?.code)?.name ?? flight.terminal.code)
    : null;
  return (
    <div className={styles.flightStrip}>
      <p className={styles.flightLine}>
        <span className={styles.flightGlyph} aria-hidden="true">
          ✈
        </span>
        {flight.number ? <span className={styles.flightNumber}>{flight.number}</span> : null}
        {place ? (
          <span className={styles.flightPlace}>
            {kind === 'pickup' ? 'from' : 'to'} {place}
          </span>
        ) : null}
        {when ? <span className={styles.flightWhen}>{when}</span> : null}
      </p>
      <p className={styles.terminalLine}>
        {terminal ? (
          <>
            <span className={styles.terminalName}>
              {kind === 'pickup' ? 'Pick up at' : 'Drop off at'} {terminal}
            </span>
            {flight.terminal?.source === 'timetable' ? (
              <span className={styles.terminalSource}>from the airline timetable — check the booking</span>
            ) : null}
          </>
        ) : (
          <span className={styles.terminalSource}>
            Terminal not known — choose it below if the booking says, as each terminal has its own road in.
          </span>
        )}
      </p>
    </div>
  );
}
