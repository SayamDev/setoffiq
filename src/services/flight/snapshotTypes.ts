/** The shape written by scripts/fetch-flight-snapshot.mjs and served statically. */
export interface SnapshotAircraft {
  callsign: string;
  icao24: string;
  latitude: number;
  longitude: number;
  baroAltitudeM: number | null;
  geoAltitudeM: number | null;
  groundSpeedMps: number | null;
  verticalRateMps: number | null;
  /**
   * Direction of travel, degrees clockwise from true north. Optional because
   * snapshots published before it was captured do not carry it.
   */
  trueTrackDeg?: number | null;
  onGround: boolean;
  /** Seconds since the epoch of the last position report. */
  lastContact: number;
  /**
   * The route this callsign is reported to fly, as the leg that matters to the
   * airport: arriving here if it stops here, otherwise first to last. From the
   * Virtual Radar Server standing data — community-submitted, so "reported",
   * never "scheduled". Absent or null when unknown.
   */
  route?: SnapshotRoute | null;
}

export interface SnapshotAirport {
  icao: string;
  iata: string | null;
  city: string | null;
  name: string | null;
  country: string | null;
}

export interface SnapshotRoute {
  from: SnapshotAirport;
  to: SnapshotAirport;
}

export interface FlightSnapshot {
  /** ISO timestamp of when the snapshot job ran. */
  generatedAt: string;
  airportIcao: string;
  source: string;
  attribution: string;
  /** Licence the published file is offered under. */
  license?: string;
  routesAttribution?: string | null;
  radiusKm: number;
  /** Inside this every aircraft is kept; beyond it only those routed here. */
  nearRadiusKm?: number;
  aircraft: SnapshotAircraft[];
}
