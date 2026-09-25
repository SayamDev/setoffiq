export const KEEP_DAYS: number;
export const APPROACH_BANDS_KM: number[];

export function mergeLandings(previous: unknown, schedule: unknown, nowMs: number): {
  generatedAt: string;
  since: string;
  landings: Record<
    string,
    {
      flight: string;
      callsign: string | null;
      scheduled: number;
      firstEstimate: { value: number; seenAt: number } | null;
      actual: number | null;
      status: string | null;
    }
  >;
};

export function mergeApproachSamples(
  previous: unknown,
  aircraft: unknown[],
  nowMs: number,
  airport: { icao: string },
  distanceKm: (aircraft: never) => number,
): {
  generatedAt: string;
  arrivals: {
    callsign: string;
    firstSeen: number;
    samples: Record<string, { t: number; km: number } & Record<string, unknown>>;
  }[];
};
