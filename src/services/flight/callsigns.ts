/**
 * Airline IATA prefix to ICAO callsign prefix.
 *
 * Aircraft broadcast an ICAO callsign ("UAE21"), while a boarding pass shows
 * an IATA flight number ("EK21"). These designators are published by ICAO and
 * are stable; the table covers airlines that commonly serve Manchester. An
 * unknown prefix is not guessed — the raw input is tried as-is and the app
 * says plainly when it could not find the aircraft.
 */
const IATA_TO_ICAO: Record<string, string> = {
  AA: 'AAL',
  AF: 'AFR',
  AY: 'FIN',
  AZ: 'ITY',
  BA: 'BAW',
  BE: 'BEE',
  DL: 'DAL',
  EI: 'EIN',
  EK: 'UAE',
  ET: 'ETH',
  EW: 'EWG',
  EY: 'ETD',
  FR: 'RYR',
  IB: 'IBE',
  KL: 'KLM',
  LH: 'DLH',
  LS: 'EXS',
  LX: 'SWR',
  OS: 'AUA',
  PC: 'PGT',
  QR: 'QTR',
  SK: 'SAS',
  SN: 'BEL',
  SQ: 'SIA',
  TK: 'THY',
  TP: 'TAP',
  TOM: 'TOM',
  U2: 'EZY',
  UA: 'UAL',
  VS: 'VIR',
  VY: 'VLG',
  W6: 'WZZ',
  WF: 'WIF',
  X3: 'TUI',
};

export function normaliseFlightNumber(input: string): string {
  return input.trim().toUpperCase().replace(/[\s-]/g, '');
}

/**
 * Every callsign this flight number might be broadcast as. Aircraft pad the
 * numeric part inconsistently, so the padded variants are included.
 */
export function candidateCallsigns(flightNumber: string): string[] {
  const value = normaliseFlightNumber(flightNumber);
  const match = /^([A-Z]{2,3}|[A-Z]\d|\d[A-Z])(\d{1,4}[A-Z]?)$/.exec(value);
  if (!match) return value ? [value] : [];

  const [, prefix, suffix] = match as unknown as [string, string, string];
  const icao = IATA_TO_ICAO[prefix];
  const prefixes = icao ? [icao, prefix] : [prefix];

  const digits = suffix.replace(/[A-Z]$/, '');
  const trailing = suffix.slice(digits.length);
  const numericVariants = new Set<string>([suffix]);
  for (let width = digits.length; width <= 4; width += 1) {
    numericVariants.add(digits.padStart(width, '0') + trailing);
  }

  const candidates = new Set<string>();
  for (const candidatePrefix of prefixes) {
    for (const variant of numericVariants) {
      candidates.add(candidatePrefix + variant);
    }
  }
  return [...candidates];
}

export function knownAirlinePrefixes(): string[] {
  return Object.keys(IATA_TO_ICAO).sort();
}

/** ICAO callsign prefix back to the IATA code a ticket would show. */
const ICAO_TO_IATA: Record<string, string> = Object.fromEntries(
  Object.entries(IATA_TO_ICAO).map(([iata, icao]) => [icao, iata]),
);

/**
 * Turn a broadcast callsign back into something resembling a flight number.
 *
 * Returns null when there is no honest mapping — Ryanair and easyJet broadcast
 * alphanumeric callsigns unrelated to the number on a ticket, and inventing one
 * would be worse than showing the callsign as-is.
 */
export function callsignToFlightNumber(callsign: string): string | null {
  const value = normaliseFlightNumber(callsign);
  const match = /^([A-Z]{3})(\d{1,4})$/.exec(value);
  if (!match) return null;
  const iata = ICAO_TO_IATA[match[1]!];
  return iata ? `${iata}${match[2]}` : null;
}
