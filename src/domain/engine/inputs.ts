import type {
  AirportProfile,
  DataState,
  DropoffMode,
  FlightStatus,
  Instant,
  JourneyKind,
  PassengerRoute,
  PickupMode,
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
  observedAt: Instant | null;
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
  /** Straight-line origin-to-airport distance, used only if routing fails. */
  distanceKm: number;
  flight: ProviderInput<FlightStatus>;
  route: ProviderInput<RouteResult>;
  weather: ProviderInput<WeatherSnapshot>;
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
