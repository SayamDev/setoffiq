import { describe, expect, it } from 'vitest';
import { candidateCallsigns, normaliseFlightNumber } from './callsigns';

describe('flight number to callsign', () => {
  it('maps a known airline prefix to its ICAO callsign', () => {
    expect(candidateCallsigns('EK21')).toContain('UAE21');
    expect(candidateCallsigns('KL1038')).toContain('KLM1038');
    expect(candidateCallsigns('BA9270')).toContain('BAW9270');
  });

  it('covers the zero-padding aircraft actually broadcast', () => {
    const candidates = candidateCallsigns('EK21');
    expect(candidates).toEqual(expect.arrayContaining(['UAE21', 'UAE021', 'UAE0021']));
  });

  it('keeps the raw flight number as a candidate too', () => {
    expect(candidateCallsigns('EK21')).toContain('EK21');
  });

  it('handles numeric and alphanumeric airline prefixes', () => {
    expect(candidateCallsigns('U28234')).toContain('EZY8234');
    expect(candidateCallsigns('W6 1234')).toContain('WZZ1234');
  });

  it('does not invent a mapping for an unknown airline', () => {
    const candidates = candidateCallsigns('ZZ999');
    expect(candidates).toContain('ZZ999');
    expect(candidates.every((value) => value.startsWith('ZZ'))).toBe(true);
  });

  it('returns the input unchanged when it is not shaped like a flight number', () => {
    // Ryanair and easyJet broadcast alphanumeric callsigns unrelated to the
    // flight number on the ticket, so there is nothing sensible to derive.
    expect(candidateCallsigns('RYR61UR')).toEqual(['RYR61UR']);
    expect(candidateCallsigns('')).toEqual([]);
  });

  it('normalises spacing and case', () => {
    expect(normaliseFlightNumber(' ek-21 ')).toBe('EK21');
  });
});
