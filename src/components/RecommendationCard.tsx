import { advisoryAt } from '../domain/engine';
import { formatClock, formatClockRange, formatDate, formatMinuteRange } from '../domain/time';
import { cardMeta } from '../domain/routeText';
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
  const showFlight = Boolean(flight && (flight.number || flight.route));
  const terminal = flight?.terminal
    ? (airport.terminals.find((one) => one.code === flight.terminal?.code)?.code ?? flight.terminal.code)
    : null;

  return (
    <section className={styles.card} aria-labelledby="recommendation-heading">
      <div className={SIGNAL_CLASS[advisory.kind]} aria-hidden="true" />

      <div className={styles.head}>
        {/* Which flight this is, first: everything below is about it. */}
        {showFlight && flight ? <FlightTitle flight={flight} kind={recommendation.kind} airport={airport} /> : null}
        {showFlight ? null : (
          <p className={styles.eyebrow} id="recommendation-heading">
            Set off at
          </p>
        )}
        <div className={styles.confidence}>
          <ConfidenceBadge confidence={recommendation.confidence} />
        </div>
      </div>

      {showFlight ? (
        <p className={styles.eyebrowAboveTime} id="recommendation-heading">
          Set off at
        </p>
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

      {/*
        * In the order things happen: the drive, reaching the airport, then the
        * passenger at the terminal (or ready to collect). Where — the
        * terminal — comes last, beside the note that explains it.
        */}
      <dl className={flight ? styles.detailsFour : styles.details}>
        <div>
          <dt className={styles.term}>Journey</dt>
          <dd className={styles.value}>{formatMinuteRange(recommendation.journey)}</dd>
        </div>

        <div>
          <dt className={styles.term}>Arrive at airport</dt>
          <dd className={styles.value}>
            {formatClockRange(recommendation.airportArrivalWindow, zone)}
          </dd>
        </div>

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

        {flight ? (
          <div>
            <dt className={styles.term}>Terminal</dt>
            <dd className={terminal ? styles.value : styles.valueMuted}>
              {terminal ?? 'Not known'}
              {terminal && flight.terminal?.source === 'timetable' ? (
                <span className={styles.marker} aria-hidden="true">
                  *
                </span>
              ) : null}
            </dd>
          </div>
        ) : null}
      </dl>
      {flight && (!terminal || flight.terminal?.source === 'timetable') ? (
        <p className={styles.detailsNote}>
          {terminal
            ? `* Terminal from the airline timetable. Check the booking — each terminal has its own road in.`
            : 'Choose the terminal below if the booking says: each terminal has its own road in, which changes the drive.'}
        </p>
      ) : null}

      {children ? <div className={styles.footer}>{children}</div> : null}
    </section>
  );
}

function FlightTitle({
  flight,
  kind,
  airport,
}: {
  flight: NonNullable<Parameters<typeof RecommendationCard>[0]['flight']>;
  kind: Recommendation['kind'];
  airport: AirportProfile;
}): React.JSX.Element {
  const route = flight.route;
  const place = route?.city ?? route?.iata ?? null;
  const where = place ? `${kind === 'pickup' ? 'from' : 'to'} ${place}${route?.city && route.iata ? ` (${route.iata})` : ''}` : null;
  const meta = route ? cardMeta(route, kind, airport.timeZone) : null;
  return (
    <div className={styles.flightTitle}>
      <p className={styles.flightName}>
        <span className={styles.flightGlyph} aria-hidden="true">
          ✈
        </span>
        {flight.number ? <span className={styles.flightNumber}>{flight.number}</span> : null}
        {where ? <span>{where}</span> : null}
      </p>
      {meta ? <p className={styles.flightMeta}>{meta}</p> : null}
    </div>
  );
}
