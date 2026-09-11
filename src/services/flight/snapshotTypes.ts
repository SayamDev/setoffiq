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
  /** Seconds since the epoch, as OpenSky reports it. */
  lastContact: number;
}

export interface FlightSnapshot {
  /** ISO timestamp of when the snapshot job ran. */
  generatedAt: string;
  airportIcao: string;
  source: string;
  attribution: string;
  radiusKm: number;
  aircraft: SnapshotAircraft[];
}
