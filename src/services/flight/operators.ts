/**
 * Who is flying an aircraft, from the three-letter ICAO designator that starts
 * its callsign.
 *
 * Names were checked against Wikipedia's current list of airline codes on
 * 11 September 2026, not OpenFlights, whose data predates several
 * reassignments: EAI is now Emerald Airlines, TOM is TUI Airways, NPT is West
 * Atlantic UK and BOX is AeroLogic. The table covers operators seen in the
 * Manchester snapshot plus the airlines in the callsign map. An unknown prefix
 * shows no name rather than a guess.
 */
const PASSENGER_OPERATORS: Record<string, string> = {
  AAL: 'American Airlines',
  ACA: 'Air Canada',
  AEE: 'Aegean Airlines',
  AFR: 'Air France',
  AIC: 'Air India',
  AUA: 'Austrian Airlines',
  AUR: 'Aurigny',
  BAW: 'British Airways',
  BEL: 'Brussels Airlines',
  CCA: 'Air China',
  CFE: 'BA CityFlyer',
  DAL: 'Delta Air Lines',
  DLA: 'Air Dolomiti',
  DLH: 'Lufthansa',
  EDW: 'Edelweiss Air',
  EFW: 'BA Euroflyer',
  // Emerald Airlines operates as Aer Lingus Regional, which is the name on
  // the ticket and on the aircraft.
  EAI: 'Aer Lingus Regional',
  EIN: 'Aer Lingus',
  EJU: 'easyJet',
  ETD: 'Etihad Airways',
  ETH: 'Ethiopian Airlines',
  EWG: 'Eurowings',
  EXS: 'Jet2',
  EZS: 'easyJet',
  EZY: 'easyJet',
  FIN: 'Finnair',
  IBE: 'Iberia',
  ITY: 'ITA Airways',
  KLC: 'KLM Cityhopper',
  KLM: 'KLM',
  LGL: 'Luxair',
  LOG: 'Loganair',
  LOT: 'LOT Polish Airlines',
  NJE: 'NetJets',
  NOZ: 'Norwegian',
  PGT: 'Pegasus Airlines',
  QTR: 'Qatar Airways',
  RAM: 'Royal Air Maroc',
  RUK: 'Ryanair',
  RYR: 'Ryanair',
  SAS: 'Scandinavian Airlines',
  SHT: 'British Airways',
  SIA: 'Singapore Airlines',
  SWR: 'Swiss',
  SXS: 'SunExpress',
  TAP: 'TAP Air Portugal',
  THY: 'Turkish Airlines',
  TOM: 'TUI Airways',
  UAE: 'Emirates',
  UAL: 'United Airlines',
  VIR: 'Virgin Atlantic',
  VJT: 'VistaJet',
  VLG: 'Vueling',
  WUK: 'Wizz Air',
  WZZ: 'Wizz Air',
};

/**
 * Freight-only operators. Nobody is collected from these, so offering them in
 * a pickup list is noise. Kept to operators with no passenger service at all;
 * mixed operators stay in, because leaving out a real passenger flight is
 * worse than showing a freighter.
 */
const CARGO_OPERATORS: Record<string, string> = {
  BCS: 'DHL (European Air Transport)',
  BOX: 'AeroLogic',
  CLX: 'Cargolux',
  DHK: 'DHL Air UK',
  FDX: 'FedEx',
  GTI: 'Atlas Air',
  NPT: 'West Atlantic',
  SWN: 'West Atlantic',
  TAY: 'ASL Airlines Belgium',
  UPS: 'UPS',
};

function designator(callsign: string): string {
  return callsign.trim().toUpperCase().slice(0, 3);
}

export function operatorName(callsign: string): string | null {
  const code = designator(callsign);
  return PASSENGER_OPERATORS[code] ?? CARGO_OPERATORS[code] ?? null;
}

export function isCargoOperator(callsign: string): boolean {
  return designator(callsign) in CARGO_OPERATORS;
}
