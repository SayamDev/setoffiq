import type { ReadinessProgress, SignalReport } from './signals';

/**
 * SetoffIQ domain model.
 *
 * Every point in time inside the application is an `Instant` (epoch
 * milliseconds, UTC). Wall-clock strings only exist at the edges: when parsing
 * what the user typed, and when formatting for display in the airport's own
 * timezone. See `src/domain/time.ts`.
 */

/** A point in time, in epoch milliseconds. Timezone-free by construction. */
export type Instant = number;

/** An inclusive span between two instants. `earliest` is always <= `latest`. */
export interface TimeWindow {
  earliest: Instant;
  latest: Instant;
}

/** A duration expressed as a plausible range, in whole minutes. */
export interface MinuteRange {
  minMinutes: number;
  maxMinutes: number;
}

export type JourneyKind = 'pickup' | 'dropoff';

/** Arrivals are processed differently depending on where the flight came from. */
export type PassengerRoute = 'domestic' | 'international';

// ---------------------------------------------------------------------------
// Data envelopes
// ---------------------------------------------------------------------------

/**
 * Whether a piece of externally sourced data can currently be trusted.
 * `stale` means we have a value but it is older than we would like;
 * `unavailable` means we have no usable value at all.
 */
export type DataState = 'ok' | 'stale' | 'unavailable';

/**
 * Everything a provider returns is wrapped so the UI can always answer
 * "where did this come from and how old is it?" without knowing the provider.
 */
export interface Observed<T> {
  state: DataState;
  value: T | null;
  /** When this application retrieved the data. */
  fetchedAt: Instant | null;
  /** When the data itself was measured at source, if the source says so. */
  observedAt: Instant | null;
  provider: string;
  attribution: string | null;
  /** A message safe to show a user. Never a raw API error. */
  message: string | null;
}

// ---------------------------------------------------------------------------
// Airports
// ---------------------------------------------------------------------------

export interface Terminal {
  code: string;
  name: string;
}

export interface PickupOption {
  id: PickupMode;
  label: string;
  description: string;
  /**
   * Minutes between reaching the airport and standing where the passenger
   * will be met. Covers parking and walking. A product assumption, not an
   * airport-published figure.
   */
  meetingBufferMinutes: number;
  /** Shown verbatim; never a made-up price. */
  costNote: string | null;
}

export type PickupMode = 'short-stay' | 'quick-pickup' | 'meet-and-greet';
export type DropoffMode = 'drop-off' | 'parking' | 'meet-and-greet';

export interface DropoffOption {
  id: DropoffMode;
  label: string;
  description: string;
  /** Minutes from reaching the airport to the passenger being at the terminal door. */
  terminalBufferMinutes: number;
  costNote: string | null;
}

/**
 * How long a passenger plausibly takes to get from the aircraft to the
 * meeting point. These are product assumptions, documented in
 * DATA-SOURCES.md, and are not published airport statistics.
 */
export interface ProcessingProfile {
  route: PassengerRoute;
  disembarkation: MinuteRange;
  borderControl: MinuteRange;
  baggage: MinuteRange;
  terminalWalk: MinuteRange;
}

/**
 * Minutes before departure that a passenger should be at the terminal.
 * Sourced from the airline/airport guidance recorded in the profile's
 * `guidanceSource`, or clearly marked as an assumption.
 */
export interface DepartureBuffer {
  route: PassengerRoute;
  recommended: MinuteRange;
  guidanceSource: string | null;
}

export interface AirportProfile {
  iataCode: string;
  icaoCode: string;
  name: string;
  country: string;
  timeZone: string;
  latitude: number;
  longitude: number;
  terminals: Terminal[];
  pickupOptions: PickupOption[];
  dropoffOptions: DropoffOption[];
  processingProfiles: ProcessingProfile[];
  departureBuffers: DepartureBuffer[];
  /** Links the UI shows instead of inventing parking prices or queue times. */
  officialLinks: { label: string; url: string }[];
  notes: string[];
}

// ---------------------------------------------------------------------------
// Flights
// ---------------------------------------------------------------------------

export type FlightPhase =
  | 'scheduled'
  | 'airborne'
  | 'landed'
  | 'cancelled'
  | 'diverted'
  | 'unknown';

export interface AircraftPosition {
  latitude: number;
  longitude: number;
  baroAltitudeM: number | null;
  geoAltitudeM: number | null;
  groundSpeedMps: number | null;
  verticalRateMps: number | null;
  onGround: boolean;
  distanceToAirportKm: number;
}

/** Where an arrival or departure estimate came from. Never guessed. */
export type TimeSource = 'user-schedule' | 'live-position' | 'scenario';

export interface FlightStatus {
  /** Flight number as the user typed it, e.g. "EK21". */
  flightNumber: string | null;
  /** ICAO callsign as broadcast, e.g. "UAE21". Only set when observed. */
  callsign: string | null;
  phase: FlightPhase;
  /** What the user's booking says. Always user-supplied. */
  scheduledArrival: Instant | null;
  scheduledDeparture: Instant | null;
  /** Our best current estimate, which may equal the scheduled time. */
  estimatedArrival: Instant | null;
  estimatedArrivalSource: TimeSource | null;
  position: AircraftPosition | null;
  /** When the underlying observation was made at source. */
  observedAt: Instant | null;
}

export interface FlightSearchInput {
  airport: AirportProfile;
  flightNumber: string | null;
  scheduledArrival: Instant | null;
  scheduledDeparture: Instant | null;
  /**
   * Set when the user explicitly asked to check again. Serving a cached
   * answer to a deliberate "check now" would be misleading, so providers skip
   * their cache for it.
   */
  forceRefresh?: boolean;
}

export interface FlightProvider {
  readonly id: string;
  readonly label: string;
  readonly attribution: string | null;
  getFlightStatus(input: FlightSearchInput, signal?: AbortSignal): Promise<Observed<FlightStatus>>;
}

// ---------------------------------------------------------------------------
// Weather, routing
// ---------------------------------------------------------------------------

export type WeatherSeverity = 'clear' | 'moderate' | 'poor';

export interface WeatherSnapshot {
  temperatureC: number;
  precipitationMm: number;
  windSpeedKph: number;
  windGustKph: number | null;
  visibilityM: number | null;
  weatherCode: number;
  description: string;
  severity: WeatherSeverity;
  /** The hour this snapshot describes. */
  validFor: Instant;
}

/**
 * Conditions at the airport itself, from an aviation routine weather report.
 *
 * This is a different question from the weather on the drive: a METAR
 * describes the aerodrome, in aviation terms, and is the better signal for
 * whether arrivals are being slowed. It says nothing about traffic, and
 * nothing about queues inside the terminal.
 */
export interface AirportConditions {
  icaoCode: string;
  observedAt: Instant;
  temperatureC: number | null;
  windDirectionDeg: number | null;
  windSpeedKt: number | null;
  /** As reported, e.g. "6+" statute miles. Kept verbatim rather than parsed. */
  visibility: string | null;
  ceilingFt: number | null;
  /** Aviation flight category, when the source supplies one. */
  flightCategory: 'VFR' | 'MVFR' | 'IFR' | 'LIFR' | null;
  /** The untouched observation, so nothing is hidden behind our parsing. */
  raw: string;
  /** A plain-language line built at normalisation time. */
  summary: string;
}

export interface AirportConditionsProvider {
  readonly id: string;
  readonly label: string;
  readonly attribution: string | null;
  getConditions(
    airport: AirportProfile,
    signal?: AbortSignal,
  ): Promise<Observed<AirportConditions>>;
}

export interface GeoPoint {
  latitude: number;
  longitude: number;
  label: string;
}

export interface RouteResult {
  durationSeconds: number;
  distanceMeters: number;
  /** OSRM models free-flow speeds only; nothing here is traffic-aware. */
  trafficAware: false;
  /** True when the duration was estimated locally rather than routed. */
  estimatedWithoutRouting: boolean;
}

export interface RouteRequest {
  origin: GeoPoint;
  destination: GeoPoint;
}

export interface RoutingProvider {
  readonly id: string;
  readonly label: string;
  readonly attribution: string | null;
  geocode(input: string, signal?: AbortSignal): Promise<Observed<GeoPoint>>;
  calculateRoute(input: RouteRequest, signal?: AbortSignal): Promise<Observed<RouteResult>>;
}

export interface WeatherProvider {
  readonly id: string;
  readonly label: string;
  readonly attribution: string | null;
  getWeather(point: GeoPoint, at: Instant, signal?: AbortSignal): Promise<Observed<WeatherSnapshot>>;
}

// ---------------------------------------------------------------------------
// Recommendations
// ---------------------------------------------------------------------------

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface ConfidenceReason {
  label: string;
  detail: string;
  impact: 'positive' | 'negative';
}

/**
 * An application heuristic, not a calibrated statistical probability.
 * `score` is only meaningful relative to other SetoffIQ recommendations.
 */
export interface ConfidenceAssessment {
  level: ConfidenceLevel;
  score: number;
  reasons: ConfidenceReason[];
}

export interface RecommendationFactor {
  id: string;
  label: string;
  value: string;
  detail: string;
  /** Distinguishes measured data from our own assumptions. */
  basis: 'live-data' | 'user-supplied' | 'assumption' | 'unavailable';
}

export type AdvisoryKind =
  | 'plan'
  | 'wait'
  /** The departure window opens shortly — time to get ready. */
  | 'get-ready'
  | 'leave-now'
  | 'running-late'
  | 'blocked';

export interface Advisory {
  kind: AdvisoryKind;
  headline: string;
  detail: string;
}

export interface PassengerReadinessEstimate {
  window: TimeWindow;
  processing: MinuteRange;
  landing: Instant;
  route: PassengerRoute;
}

interface RecommendationBase {
  computedAt: Instant;
  recommendedDeparture: Instant;
  airportArrivalWindow: TimeWindow;
  journey: MinuteRange;
  confidence: ConfidenceAssessment;
  factors: RecommendationFactor[];
  /** Every input, described in its own terms. Confidence is derived from these. */
  signals: SignalReport[];
  advisory: Advisory;
}

export interface PickupRecommendation extends RecommendationBase {
  kind: 'pickup';
  readiness: PassengerReadinessEstimate;
  /** How far along the passenger is, and whether that was observed or inferred. */
  progress: ReadinessProgress;
  mode: PickupMode;
}

export interface DropoffRecommendation extends RecommendationBase {
  kind: 'dropoff';
  flightDeparture: Instant;
  terminalArrivalWindow: TimeWindow;
  departureBuffer: MinuteRange;
  mode: DropoffMode;
}

export type Recommendation = PickupRecommendation | DropoffRecommendation;

/** Returned instead of a recommendation when the inputs cannot support one. */
export interface RecommendationUnavailable {
  kind: 'unavailable';
  computedAt: Instant;
  headline: string;
  detail: string;
}

export type RecommendationResult = Recommendation | RecommendationUnavailable;

// ---------------------------------------------------------------------------
// Journeys, monitoring, history
// ---------------------------------------------------------------------------

export interface JourneyInput {
  kind: JourneyKind;
  airportIata: string;
  flightNumber: string | null;
  /** Arrival for a pickup, departure for a drop-off. Always user-supplied. */
  scheduledTime: Instant;
  passengerRoute: PassengerRoute;
  terminalCode: string | null;
  origin: GeoPoint;
  pickupMode: PickupMode | null;
  dropoffMode: DropoffMode | null;
  /** Set only when the user explicitly chose a labelled test scenario. */
  scenarioId: string | null;
}

export type MonitoringState = 'off' | 'active' | 'paused' | 'stopped';

export interface RecommendationVersion {
  id: string;
  createdAt: Instant;
  departure: Instant;
  confidence: ConfidenceLevel;
  /** Why this version replaced the previous one. Null for the first version. */
  reason: string | null;
  flightPhase: FlightPhase;
  dataObservedAt: Instant | null;
}

export type JourneyEventKind =
  | 'created'
  | 'checked'
  | 'flight-updated'
  | 'recommendation-changed'
  | 'monitoring-paused'
  | 'monitoring-resumed'
  | 'provider-failed'
  | 'notified';

export interface JourneyEvent {
  id: string;
  at: Instant;
  kind: JourneyEventKind;
  message: string;
}

export interface SavedJourney {
  id: string;
  label: string;
  createdAt: Instant;
  updatedAt: Instant;
  input: JourneyInput;
  monitoring: MonitoringState;
  lastCheckedAt: Instant | null;
  versions: RecommendationVersion[];
  events: JourneyEvent[];
}

export interface AppNotification {
  id: string;
  journeyId: string;
  at: Instant;
  title: string;
  body: string;
}
