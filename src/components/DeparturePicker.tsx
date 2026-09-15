import { useState } from 'react';
import { GATE_TO_TAKEOFF_MINUTES } from '../domain/assumptions';
import { formatClock, formatDate } from '../domain/time';
import type { AirportProfile } from '../domain/types';
import {
  loadArrivalHistory,
  loadSchedule,
  loadTimetable,
  timetableWindow,
  upcomingDepartures,
  USUAL_MIN_DAYS,
  usualDepartures,
  withoutScheduled,
  type FlightSchedule,
  type FlightTimetable,
  type ListedFlight,
  type TimetableFlight,
  type UsualDeparture,
} from '../services/flight';
import { describeScheduled, ScheduledList } from './ScheduledList';
import { describe, type PickedFlight } from './InboundPicker';
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

type State =
  | { kind: 'idle' }
  | { kind: 'loading'; refreshing: boolean }
  | {
      kind: 'ready';
      since: string | null;
      departures: UsualDeparture[];
      schedule: FlightSchedule | null;
      timetable: FlightTimetable | null;
    }
  | { kind: 'unavailable' }
  | { kind: 'picked'; title: string; detail: string };

const INITIAL_VISIBLE_FLIGHTS = 5;
const VISIBLE_FLIGHTS_STEP = 5;
const TIMETABLE_BROWSE_LIMIT = 30;
const REFRESH_FEEDBACK_MS = 700;

type VisibleSection = 'scheduled' | 'timetable' | 'usual';

const INITIAL_VISIBLE_COUNTS: Record<VisibleSection, number> = {
  scheduled: INITIAL_VISIBLE_FLIGHTS,
  timetable: INITIAL_VISIBLE_FLIGHTS,
  usual: INITIAL_VISIBLE_FLIGHTS,
};

/**
 * The drop-off side of the picker.
 *
 * There is no live list here — a departure is not in the air until it has
 * gone. So it is the schedule for the next few hours, with delays and
 * cancellations, and the airlines' weekly timetable for everything after that:
 * a drop-off is usually arranged days ahead, which is exactly the period
 * nothing else here can describe.
 *
 * SetoffIQ's own record is the last resort, and it sees take-off rather than
 * the gate time on a booking, so the time it fills in is the usual take-off
 * less a gate-to-take-off allowance, at the cautious end: too early costs a
 * wait, too late costs the flight.
 */
export function DeparturePicker({
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
    setVisibleCounts(INITIAL_VISIBLE_COUNTS);
    const refreshStartedAt = Date.now();
    if (refreshing && state.kind === 'ready') {
      setIsRefreshing(true);
    } else {
      setState({ kind: 'loading', refreshing: false });
    }
    // Opening the picker re-fetches everything rather than reading the
    // browser's cache: the published files change behind the site, and a
    // quietly stale list of flights is worse than a second's wait.
    const fresh = { forceRefresh: true };
    try {
      const [history, schedule, timetable] = await Promise.all([
        loadArrivalHistory(undefined, fresh),
        loadSchedule(undefined, fresh),
        loadTimetable(undefined, fresh),
      ]);
      if (!history && !schedule && !timetable) {
        setState({ kind: 'unavailable' });
        return;
      }
      setState({
        kind: 'ready',
        since: history?.departuresSince ?? null,
        departures: history ? usualDepartures(history, airport, Date.now()) : [],
        schedule,
        timetable,
      });
    } finally {
      if (refreshing) await holdRefreshFeedback(refreshStartedAt);
      setIsRefreshing(false);
    }
  };

  const pickScheduled = (flight: ListedFlight): void => {
    // A schedule's departure time is the gate time on the booking: no allowance.
    onPick({
      flightNumber: flight.flight,
      fillAt: flight.scheduled,
      otherEndCountry: flight.otherEnd?.country ?? null,
      basis: 'schedule',
    });
    setState({
      kind: 'picked',
      title: [describe(flight.flight, flight.airlineName, null), flight.place ? `to ${flight.place}` : null]
        .filter(Boolean)
        .join(' '),
      detail: describeScheduled(flight, airport.timeZone, 'departure'),
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
      title: [describe(flight.flight, flight.airlineName, null), flight.place ? `to ${flight.place}` : null]
        .filter(Boolean)
        .join(' '),
      detail: `Timetabled to leave at ${formatClock(flight.at, airport.timeZone)} on ${formatDate(flight.at, airport.timeZone)} — the gate time the airline publishes. That is the timetable, not today's status, so check the booking and the airline before you set off.`,
    });
  };

  const pick = (flight: UsualDeparture): void => {
    const gateTime = flight.usualAt - GATE_TO_TAKEOFF_MINUTES * 60_000;
    onPick({
      flightNumber: flight.flightNumber ?? flight.callsign,
      fillAt: gateTime,
      otherEndCountry: flight.toCountry,
      basis: 'usual-departure',
    });
    setState({
      kind: 'picked',
      title: [describe(flight.flightNumber ?? flight.callsign, flight.airline, null), flight.to ? `to ${flight.to}` : null]
        .filter(Boolean)
        .join(' '),
      detail: `Usually takes off around ${formatClock(flight.usualAt, airport.timeZone)} — seen on ${flight.daysSeen} of the last ${flight.daysConsidered} days. Filled in as ${formatClock(gateTime, airport.timeZone)}, allowing ${GATE_TO_TAKEOFF_MINUTES} minutes from the gate to take-off.`,
    });
  };

  if (state.kind === 'idle') {
    return (
      <button type="button" className={styles.entry} onClick={() => void load(false)}>
        <span className={styles.entryGlyph} aria-hidden="true">
          ✈
        </span>
        <span className={styles.entryText}>
          <span className={styles.entryTitle}>Dropping someone off for a flight?</span>
          <span className={styles.entryBody}>
            Choose it from the departures at {airport.name} — today, tonight or tomorrow — and the
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
        <LoadingRows label={`Fetching the latest departures for ${airport.name}...`} rows={5} />
      </div>
    );
  }

  if (state.kind === 'unavailable') {
    return (
      <div className={styles.wrapper}>
        <p className={ui.hint}>
          The departure lists could not be loaded just now. Enter the flight number and time from
          the booking below.
        </p>
        <Button variant="quiet" onClick={() => void load(false)} className={styles.change}>
          Try again
        </Button>
      </div>
    );
  }

  const now = Date.now();
  const { schedule, timetable } = state;
  const scheduled = schedule ? upcomingDepartures(schedule, now) : [];
  const scheduledShown = scheduled.filter((flight) =>
    matches(query, [flight.flight, flight.airlineName, flight.place, ...flight.aliases]),
  );
  // The timetable repeats what the schedule already covers, with less to say
  // about it, so the schedule wins wherever the two overlap.
  const timetabled = timetable
    ? withoutScheduled(timetableWindow(timetable, 'departure', now, hoursAhead), scheduled)
    : [];
  const isFiltering = query.trim().length > 0;
  const timetabledMatches = timetabled.filter((flight) =>
    matches(query, [flight.flight, flight.airlineName, flight.place, ...flight.aliases]),
  );
  const timetabledShown = isFiltering
    ? timetabledMatches
    : timetabledMatches.slice(0, TIMETABLE_BROWSE_LIMIT);
  const usualShown = state.departures.filter((flight) =>
    matches(query, [flight.flightNumber, flight.callsign, flight.airline, flight.to]),
  );
  const haveAirlabs = schedule !== null || timetable !== null;
  const scheduledShownCount = Math.max(0, visibleCounts.scheduled);
  const timetableShown = Math.max(0, visibleCounts.timetable);
  const usualShownCount = Math.max(0, visibleCounts.usual);

  return (
    <div className={styles.wrapper}>
      <FilterField value={query} onChange={updateQuery} label="Find a flight" />

      {schedule !== null && scheduledShown.length > 0 ? (
        <>
          <h2 className={styles.sectionTitle}>Today, with live status</h2>
          <p className={ui.hint}>
            From AirLabs, as of {formatClock(Date.parse(schedule.generatedAt), airport.timeZone)}.
            This is the part of the day close enough for delays and cancellations to be known. Check
            with the airline before you set off.
          </p>
          <ScheduledList
            flights={scheduledShown}
            airport={airport}
            direction="departure"
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

      {timetable !== null ? (
        <>
          <h2 className={styles.sectionTitle}>Timetabled departures</h2>
          <TimetableNote generatedAt={timetable.generatedAt} airport={airport} direction="departure" />
          <HorizonChoice
            hours={hoursAhead}
            onChange={updateHoursAhead}
            shown={timetabledShown.length}
            capped={!isFiltering && timetabledMatches.length > timetabledShown.length}
          />
          <TimetableList
            flights={timetabledShown}
            airport={airport}
            direction="departure"
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
      ) : null}

      {!haveAirlabs ? (
        <>
          <h2 className={styles.sectionTitle}>Usually leaving in the next twelve hours</h2>
          {usualShown.length === 0 ? (
            <p className={ui.hint}>
              {state.since
                ? `SetoffIQ has been recording departures since ${formatDate(Date.parse(`${state.since}T12:00:00Z`), airport.timeZone)}.`
                : 'SetoffIQ has only just started recording departures.'}{' '}
              A flight appears here once it has been seen taking off on at least {USUAL_MIN_DAYS} of
              the last seven days. Until then, enter the time from the booking below.
            </p>
          ) : (
            <>
              <p className={ui.hint}>
                Flights SetoffIQ has seen take off at about the same time on most recent days. A
                pattern it recorded, not a schedule: it cannot see delays or cancellations, and the
                time shown is take-off, not the gate time on a booking. Check with the airline.
              </p>
              <ul className={styles.list}>
                {usualShown.slice(0, usualShownCount).map((flight) => (
                  <li key={flight.callsign}>
                    <button type="button" className={styles.option} onClick={() => pick(flight)}>
                      <span className={styles.identifier}>{flight.flightNumber ?? flight.callsign}</span>
                      <span className={styles.who}>
                        {flight.airline ? <span className={styles.airline}>{flight.airline}</span> : null}
                        {flight.to ? <span className={styles.origin}>to {flight.to}</span> : null}
                        {flight.status === 'not-seen-yet' ? (
                          <span className={styles.notice}>
                            Not seen leaving yet — late, cancelled or not flying today
                          </span>
                        ) : null}
                        <span className={styles.callsign}>
                          {flight.daysSeen} of {flight.daysConsidered} days
                        </span>
                      </span>
                      <span className={styles.detail}>
                        {formatDate(flight.usualAt, airport.timeZone) === formatDate(now, airport.timeZone)
                          ? 'takes off'
                          : 'tomorrow'}
                      </span>
                      <span className={styles.detail}>~{formatClock(flight.usualAt, airport.timeZone)}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <ShowMoreControl
                total={usualShown.length}
                shown={usualShownCount}
                onShowMore={() => showMore('usual')}
              />
            </>
          )}
        </>
      ) : null}

      {scheduledShown.length === 0 && timetabledShown.length === 0 && haveAirlabs ? (
        <NothingFound query={query} onClear={() => setQuery('')} airport={airport} now={now} />
      ) : null}

      <Button
        variant="secondary"
        onClick={() => void load(true)}
        className={styles.refresh}
        disabled={isRefreshing}
      >
        {isRefreshing ? 'Refreshing...' : 'Refresh this list'}
      </Button>
      {isRefreshing ? <RefreshPopup /> : null}
    </div>
  );
}

async function holdRefreshFeedback(startedAt: number): Promise<void> {
  const remaining = REFRESH_FEEDBACK_MS - (Date.now() - startedAt);
  if (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }
}
