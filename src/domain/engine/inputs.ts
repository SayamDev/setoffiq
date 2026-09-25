import type {
  AirportConditions,
  AirportProfile,
  DataState,
  DropoffMode,
  FlightStatus,
  Instant,
  JourneyKind,
  PassengerRoute,
  PickupMode,
  RoadDisruptionSnapshot,
  RouteResult,
  WeatherSnapshot,
} from '../types';

/**
 * What the engine is given. Deliberately plain data: the engine never calls a
 * network, reads a clock, or touches the DOM, so every recommendation is
 * reproducible from these values alone.
 */
export interface ProviderInput<T> {
  value: T | null;
  state: DataState;
  /** When the source measured it. Meaningless for a forecast. */
  observedAt: Instant | null;
  /** When this application retrieved it. The right basis for a forecast. */
  fetchedAt: Instant | null;
}

export interface JourneyEngineInput {
  now: Instant;
  /**
   * Which side of the journey this is. It matters to confidence: a pickup
   * leans on live flight information, while a drop-off works from a departure
   * time the user already holds.
   */
  journeyKind: JourneyKind;
  airport: AirportProfile;
  passengerRoute: PassengerRoute;
  /** Hand luggage only skips the baggage wait on arrival. See JourneyInput. */
  luggage?: 'checked' | 'hand-only' | null;
  /** Straight-line origin-to-airport distance, used only if routing fails. */
  distanceKm: number;
  flight: ProviderInput<FlightStatus>;
  route: ProviderInput<RouteResult>;
  /** Forecast conditions along the drive. */
  weather: ProviderInput<WeatherSnapshot>;
  /** Observed conditions at the aerodrome itself. A different question. */
  airportConditions: ProviderInput<AirportConditions>;
  /**
   * Current road disruption near the airport. Absent unless a key has been
   * configured for one of the (all keyed) UK sources — see DATA-SOURCES.md.
   */
  roadDisruption: ProviderInput<RoadDisruptionSnapshot>;
}

export interface PickupEngineInput extends JourneyEngineInput {
  /** From the user's booking. The engine never invents a schedule. */
  scheduledArrival: Instant;
  mode: PickupMode;
}

export interface DropoffEngineInput extends JourneyEngineInput {
  scheduledDeparture: Instant;
  mode: DropoffMode;
}
