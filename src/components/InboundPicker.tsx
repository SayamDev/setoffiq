import { useState } from 'react';
import { formatAge, formatClock, formatDate } from '../domain/time';
import type { AirportProfile, Instant } from '../domain/types';
import {
  ARRIVAL_ESTIMATE,
  listInboundAircraft,
  loadArrivalHistory,
  loadSchedule,
  loadTimetable,
  upcomingArrivals,
  minutesAgainstUsual,
  SnapshotTooOldError,
  timetableWindow,
  USUAL_MIN_DAYS,
  usualArrivals,
  withoutScheduled,
  type ArrivalHistory,
  type FlightSchedule,
  type FlightTimetable,
  type InboundAircraft,
  type ListedFlight,
  type TimetableFlight,
  type UsualArrival,
} from '../services/flight';
import { describeScheduled, ScheduledList } from './ScheduledList';
import { FilterField, LoadingRows, matches, TimetableList } from './pickerParts';
import {
  HORIZONS,
  HorizonChoice,
  NothingFound,
  RefreshPopup,
  ShowMoreControl,
  TimetableNote,
} from './pickerSections';
import { Button, ui } from './ui';
import styles from './InboundPicker.module.css';

/** What a pick gives the form. */
export interface PickedFlight {
  flightNumber: string;
  /** The time to fill in, when there is one. */
  fillAt: Instant | null;
  /** Country at the other end of the flight, when known. */
  otherEndCountry: string | null;
  /**
   * Where the time came from: a live position, the recorded landing pattern,
   * or the recorded take-off pattern less the gate-to-take-off allowance.
   */
  basis: 'position' | 'schedule' | 'timetable' | 'usual' | 'usual-departure';
}

type Live =
  | { kind: 'ok'; aircraft: InboundAircraft[] }
  | { kind: 'too-old'; ageMinutes: number }
  | { kind: 'error' };

type State =
  | { kind: 'idle' }
  | { kind: 'loading'; refreshing: boolean }
  | {
      kind: 'ready';
      live: Live;
      /** undefined while the record is still loading; null if it could not be. */
      history: ArrivalHistory | null | undefined;
      usual: UsualArrival[];
      /** undefined while loading; null when there is no usable schedule. */
      schedule: FlightSchedule | null | undefined;
      /** The weekly timetable: what is meant to fly, at any hour of any day. */
      timetable: FlightTimetable | null | undefined;
    }
  | { kind: 'picked'; title: string; detail: string };

const INITIAL_VISIBLE_FLIGHTS = 5;
const VISIBLE_FLIGHTS_STEP = 5;
const TIMETABLE_BROWSE_LIMIT = 30;
const REFRESH_FEEDBACK_MS = 1000;

type VisibleSection = 'live' | 'scheduled' | 'timetable';

const INITIAL_VISIBLE_COUNTS: Record<VisibleSection, number> = {
  live: INITIAL_VISIBLE_FLIGHTS,
  scheduled: INITIAL_VISIBLE_FLIGHTS,
  timetable: INITIAL_VISIBLE_FLIGHTS,
};

/**
 * Pick the flight rather than type it.
 *
 * Three lists, each with a different claim to make. Aircraft in the air now,
 * from the live snapshot, timed from their position. Today's schedule, with
 * delays and cancellations — which a free AirLabs key only reaches about three
 * hours ahead of. And the airlines' weekly timetable, which carries no status
 * at all but answers at two in the morning and for a pickup next Tuesday.
 *
 * The point of the third list is that there is always something to choose:
 * before it existed, the picker was empty overnight. Each list says what it
 * can and cannot know rather than blending into one confident answer.
 */
export function InboundPicker({
  airport,
  onPick,
}: {
  airport: AirportProfile;
  onPick: (flight: PickedFlight) => void;
}): React.JSX.Element {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [query, setQuery] = useState('');
  const [hoursAhead, setHoursAhead] = useState<number>(HORIZONS[0].hours);
  const [visibleCounts, setVisibleCounts] = useState(INITIAL_VISIBLE_COUNTS);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const updateQuery = (value: string): void => {
    setQuery(value);
    setVisibleCounts(INITIAL_VISIBLE_COUNTS);
  };

  const showMore = (section: VisibleSection): void => {
    setVisibleCounts((current) => ({
      ...current,
      [section]: current[section] + VISIBLE_FLIGHTS_STEP,
    }));
  };

  const updateHoursAhead = (hours: number): void => {
    setHoursAhead(hours);
    setVisibleCounts((current) => ({ ...current, timetable: INITIAL_VISIBLE_FLIGHTS }));
  };

  const load = async (refreshing = state.kind === 'ready'): Promise<void> => {
    if (!refreshing) setVisibleCounts(INITIAL_VISIBLE_COUNTS);
    const refreshStartedAt = Date.now();
    const refreshScrollY = refreshing ? window.scrollY : null;
    if (refreshing && state.kind === 'ready') {
      setIsRefreshing(true);
    } else {
      setState({ kind: 'loading', refreshing: false });
    }
    // Opening the picker is a deliberate act, so every source is re-fetched
    // rather than answered from the browser's cache: the published files are
    // refreshed behind the site, and a list of flights that has quietly gone
    // stale is worse than a second's wait.
    const fresh = { forceRefresh: true };
    const historyPromise = loadArrivalHistory(undefined, fresh);
    const schedulePromise = loadSchedule(undefined, fresh);
    const timetablePromise = loadTimetable(undefined, fresh);
    try {
      const live = await listInboundAircraft(airport, undefined, fresh).then(
        (aircraft): Live => ({ kind: 'ok', aircraft }),
        (error: unknown): Live =>
          error instanceof SnapshotTooOldError
            ? { kind: 'too-old', ageMinutes: error.ageMinutes }
            : { kind: 'error' },
      );
      // The live list shows as soon as it is ready; the schedule, timetable and
      // record follow, rather than holding it back.
      setState({
        kind: 'ready',
        live,
        history: undefined,
        usual: [],
        schedule: undefined,
        timetable: undefined,
      });

      const [history, schedule, timetable] = await Promise.all([
        historyPromise,
        schedulePromise,
        timetablePromise,
      ]);
      const inTheAir = new Set(live.kind === 'ok' ? live.aircraft.map((a) => a.callsign) : []);
      const usual = history ? usualArrivals(history, airport, Date.now(), inTheAir) : [];
      setState((current) =>
        current.kind === 'ready' ? { ...current, history, usual, schedule, timetable } : current,
      );
    } finally {
      if (refreshing) await holdRefreshFeedback(refreshStartedAt);
      if (refreshScrollY !== null) await restoreScrollPosition(refreshScrollY);
      setIsRefreshing(false);
    }
  };

  const pickLive = (aircraft: InboundAircraft): void => {
    onPick({
      flightNumber: aircraft.flightNumber ?? aircraft.callsign,
      fillAt: aircraft.estimatedArrival,
      otherEndCountry: aircraft.fromCountry,
      basis: 'position',
    });
    setState({
      kind: 'picked',
      title: describe(aircraft.flightNumber ?? aircraft.callsign, aircraft.airline, aircraft.from),
      detail: aircraft.estimatedArrival
        ? `Due on stand about ${formatClock(aircraft.estimatedArrival, airport.timeZone)}, from its position now.`
        : 'The flight number is filled in. Enter the time from the booking below.',
    });
  };

  const pickScheduled = (flight: ListedFlight): void => {
    onPick({
      flightNumber: flight.flight,
      fillAt: flight.scheduled,
      otherEndCountry: flight.otherEnd?.country ?? null,
      basis: 'schedule',
    });
    setState({
      kind: 'picked',
      title: describe(flight.flight, flight.airlineName, flight.place),
      detail: describeScheduled(flight, airport.timeZone, 'arrival'),
    });
  };

  const pickTimetable = (flight: TimetableFlight): void => {
    onPick({
      flightNumber: flight.flight,
      fillAt: flight.at,
      otherEndCountry: flight.otherEnd?.country ?? null,
      basis: 'timetable',
    });
    setState({
      kind: 'picked',
      title: describe(flight.flight, flight.airlineName, flight.place),
      detail: `Timetabled to land at ${formatClock(flight.at, airport.timeZone)} on ${formatDate(flight.at, airport.timeZone)}. That is the airlines' timetable, not today's status — SetoffIQ will check the flight itself once it is close enough to see.`,
    });
  };

  const pickUsual = (flight: UsualArrival): void => {
    onPick({
      flightNumber: flight.flightNumber ?? flight.callsign,
      fillAt: flight.usualAt,
      otherEndCountry: flight.fromCountry,
      basis: 'usual',
    });
    setState({
      kind: 'picked',
      title: describe(flight.flightNumber ?? flight.callsign, flight.airline, flight.from),
      detail: `Usually lands around ${formatClock(flight.usualAt, airport.timeZone)} — seen on ${flight.daysSeen} of the last ${flight.daysConsidered} days. A pattern, not a schedule.`,
    });
  };

  if (state.kind === 'idle') {
    return (
      <button type="button" className={styles.entry} onClick={() => void load(false)}>
        <span className={styles.entryGlyph} aria-hidden="true">
          ✈
        </span>
        <span className={styles.entryText}>
          <span className={styles.entryTitle}>Collecting someone from a flight?</span>
          <span className={styles.entryBody}>
            Choose it from the arrivals at {airport.name} — today, tonight or tomorrow — and the
            flight and time are filled in for you. Delays and cancellations are shown for flights
            close enough for anyone to know them.
          </span>
        </span>
      </button>
    );
  }

  if (state.kind === 'picked') {
    return (
      <div className={styles.picked} role="status">
        <p className={styles.pickedTitle}>{state.title}</p>
        <p className={ui.hint}>{state.detail}</p>
        <Button variant="quiet" onClick={() => void load(false)} className={styles.change}>
          Choose a different flight
        </Button>
      </div>
    );
  }

  if (state.kind === 'loading') {
    return (
      <div className={styles.wrapper}>
        <LoadingRows
          label={
            state.refreshing
              ? `Refreshing the latest arrivals for ${airport.name}...`
              : `Fetching the latest arrivals for ${airport.name}...`
          }
          rows={state.refreshing ? 3 : 5}
        />
      </div>
    );
  }

  const { live, history, usual, schedule, timetable } = state;
  const now = Date.now();

  const aircraft =
    live.kind === 'ok'
      ? live.aircraft.filter((one) => matches(query, [one.flightNumber, one.callsign, one.airline, one.from]))
      : [];
  const scheduled = schedule ? upcomingArrivals(schedule, now) : [];
  const scheduledShown = scheduled.filter((flight) =>
    matches(query, [flight.flight, flight.airlineName, flight.place, ...flight.aliases]),
  );
  // The timetable repeats what the schedule already covers, with less to say
  // about it, so the schedule wins wherever the two overlap.
  const timetabled = timetable
    ? withoutScheduled(timetableWindow(timetable, 'arrival', now, hoursAhead), scheduled)
    : [];
  const isFiltering = query.trim().length > 0;
  const timetabledMatches = timetabled.filter((flight) =>
    matches(query, [flight.flight, flight.airlineName, flight.place, ...flight.aliases]),
  );
  const timetabledShown = isFiltering
    ? timetabledMatches
    : timetabledMatches.slice(0, TIMETABLE_BROWSE_LIMIT);
  const stillLoading = schedule === undefined || timetable === undefined;
  const nothingListed =
    !stillLoading && aircraft.length === 0 && scheduledShown.length === 0 && timetabledShown.length === 0;
  const liveShown = Math.max(0, visibleCounts.live);
  const scheduledShownCount = Math.max(0, visibleCounts.scheduled);
  const timetableShown = Math.max(0, visibleCounts.timetable);

  return (
    <div className={styles.wrapper}>
      <FilterField value={query} onChange={updateQuery} label="Find a flight" />

      {live.kind === 'ok' && aircraft.length > 0 ? (
        <>
          <h2 className={styles.sectionTitle}>In the air now</h2>
          <p className={ui.hint}>
            Nearest first, timed from where each aircraft is this minute. Where a route is shown it
            is the one reported for that callsign, not a schedule, and some airlines broadcast a
            callsign that is not the number on a ticket.
          </p>
          <ul className={styles.list}>
            {aircraft.slice(0, liveShown).map((one) => {
              const against = minutesAgainstUsual(
                history ?? null,
                one.callsign,
                one.estimatedArrival,
                airport,
                ARRIVAL_ESTIMATE.taxiMinutes,
              );
              return (
                <li key={one.callsign}>
                  <button type="button" className={styles.option} onClick={() => pickLive(one)}>
                    <span className={styles.identifier}>{one.flightNumber ?? one.callsign}</span>
                    <span className={styles.who}>
                      {one.airline ? <span className={styles.airline}>{one.airline}</span> : null}
                      {one.from ? <span className={styles.origin}>from {one.from}</span> : null}
                      {against !== null ? (
                        <span className={styles.notice}>
                          ~{Math.abs(against)} min {against > 0 ? 'later' : 'earlier'} than usual
                        </span>
                      ) : null}
                      {one.flightNumber ? (
                        <span className={styles.callsign}>{one.callsign}</span>
                      ) : (
                        <span className={styles.callsign}>callsign only</span>
                      )}
                    </span>
                    <span className={styles.detail}>{one.distanceKm} km out</span>
                    <span className={styles.detail}>
                      {one.estimatedArrival
                        ? `~${formatClock(one.estimatedArrival, airport.timeZone)}`
                        : ''}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <ShowMoreControl
            total={aircraft.length}
            shown={liveShown}
            onShowMore={() => showMore('live')}
          />
        </>
      ) : null}

      {schedule === undefined ? (
        <LoadingRows label="Fetching today's schedule…" rows={3} />
      ) : schedule !== null && scheduledShown.length > 0 ? (
        <>
          <h2 className={styles.sectionTitle}>Today, with live status</h2>
          <p className={ui.hint}>
            From AirLabs, as of {formatClock(Date.parse(schedule.generatedAt), airport.timeZone)}.
            This is the part of the day close enough for delays and cancellations to be known;
            aircraft in the air above are live. Check with the airline before you set off.
          </p>
          <ScheduledList
            flights={scheduledShown}
            airport={airport}
            direction="arrival"
            onPick={pickScheduled}
            limit={scheduledShownCount}
          />
          <ShowMoreControl
            total={scheduledShown.length}
            shown={scheduledShownCount}
            onShowMore={() => showMore('scheduled')}
          />
        </>
      ) : null}

      {timetable === undefined ? (
        <LoadingRows label="Fetching the timetable…" rows={4} />
      ) : timetable !== null ? (
        <>
          <h2 className={styles.sectionTitle}>Timetabled arrivals</h2>
          <TimetableNote generatedAt={timetable.generatedAt} airport={airport} direction="arrival" />
          <HorizonChoice
            hours={hoursAhead}
            onChange={updateHoursAhead}
            shown={timetabledShown.length}
            capped={!isFiltering && timetabledMatches.length > timetabledShown.length}
          />
          <TimetableList
            flights={timetabledShown}
            airport={airport}
            direction="arrival"
            now={now}
            onPick={pickTimetable}
            limit={timetableShown}
          />
          <ShowMoreControl
            total={timetabledShown.length}
            shown={timetableShown}
            onShowMore={() => showMore('timetable')}
          />
        </>
      ) : schedule === null ? (
        // Nothing from AirLabs at all: fall back to what SetoffIQ has recorded
        // itself, which is a pattern rather than a timetable and says so.
        <UsualSection history={history} usual={usual} airport={airport} now={now} onPick={pickUsual} />
      ) : null}

      {nothingListed ? (
        <NothingFound query={query} onClear={() => setQuery('')} airport={airport} now={now} />
      ) : null}

      {live.kind === 'too-old' && !query.trim() ? (
        <p className={ui.hint}>
          {Number.isFinite(live.ageMinutes)
            ? `The live aircraft positions are ${formatAge(live.ageMinutes)} old, so nothing is shown as in the air now. The lists below do not depend on them.`
            : 'The live aircraft positions have no timestamp, so nothing is shown as in the air now.'}
        </p>
      ) : null}
      {live.kind === 'error' && !query.trim() ? (
        <p className={ui.hint}>We couldn't check what is in the air just now.</p>
      ) : null}

      <Button
        variant="secondary"
        onClick={() => void load(true)}
        className={styles.refresh}
        disabled={isRefreshing}
      >
        Refresh this list
      </Button>
      {isRefreshing ? <RefreshPopup /> : null}
    </div>
  );
}

function UsualSection({
  history,
  usual,
  airport,
  now,
  onPick,
}: {
  history: ArrivalHistory | null | undefined;
  usual: UsualArrival[];
  airport: AirportProfile;
  now: number;
  onPick: (flight: UsualArrival) => void;
}): React.JSX.Element {
  const [shown, setShown] = useState(INITIAL_VISIBLE_FLIGHTS);
  return (
    <>
      <h2 className={styles.sectionTitle}>Usually in the next twelve hours</h2>
      {history === undefined ? (
        <p className={ui.hint}>Checking SetoffIQ's record of arrivals…</p>
      ) : history === null ? (
        <p className={ui.hint}>SetoffIQ's record of arrivals could not be loaded just now.</p>
      ) : usual.length === 0 ? (
        <p className={ui.hint}>
          SetoffIQ has been recording arrivals since{' '}
          {formatDate(Date.parse(`${history.recordingSince}T12:00:00Z`), airport.timeZone)}. A
          flight appears here once it has been seen landing on at least {USUAL_MIN_DAYS} of the last
          seven days. Until then, enter the time from the booking below.
        </p>
      ) : (
        <>
          <p className={ui.hint}>
            Flights SetoffIQ has seen land here at about the same time on most recent days. This is
            a pattern it recorded, not a schedule: it cannot see delays or cancellations until the
            aircraft is in the air, so check with the airline.
          </p>
          <ul className={styles.list}>
            {usual.slice(0, shown).map((flight) => (
              <li key={flight.callsign}>
                <button type="button" className={styles.option} onClick={() => onPick(flight)}>
                  <span className={styles.identifier}>{flight.flightNumber ?? flight.callsign}</span>
                  <span className={styles.who}>
                    {flight.airline ? <span className={styles.airline}>{flight.airline}</span> : null}
                    {flight.from ? <span className={styles.origin}>from {flight.from}</span> : null}
                    {flight.status === 'not-seen-yet' ? (
                      <span className={styles.notice}>
                        Not seen yet — late, cancelled or not flying today
                      </span>
                    ) : null}
                    <span className={styles.callsign}>
                      {flight.daysSeen} of {flight.daysConsidered} days
                    </span>
                  </span>
                  <span className={styles.detail}>
                    {formatDate(flight.usualAt, airport.timeZone) === formatDate(now, airport.timeZone)
                      ? 'usually'
                      : 'tomorrow'}
                  </span>
                  <span className={styles.detail}>~{formatClock(flight.usualAt, airport.timeZone)}</span>
                </button>
              </li>
            ))}
          </ul>
          <ShowMoreControl
            total={usual.length}
            shown={shown}
            onShowMore={() => setShown((current) => current + VISIBLE_FLIGHTS_STEP)}
          />
        </>
      )}
    </>
  );
}

export function describe(identifier: string, airline: string | null, from: string | null): string {
  return [identifier, airline ? `· ${airline}` : null, from ? `from ${from}` : null].filter(Boolean).join(' ');
}

async function holdRefreshFeedback(startedAt: number): Promise<void> {
  const remaining = REFRESH_FEEDBACK_MS - (Date.now() - startedAt);
  if (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }
}

async function restoreScrollPosition(scrollY: number): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  window.scrollTo(0, scrollY);
}
