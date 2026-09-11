import { describe, expect, it } from 'vitest';
import { callsignToFlightNumber } from './callsigns';

describe('turning a callsign back into a flight number', () => {
  it('maps airlines whose callsign matches the ticket', () => {
    expect(callsignToFlightNumber('KLM1038')).toBe('KL1038');
    expect(callsignToFlightNumber('BAW9270')).toBe('BA9270');
    expect(callsignToFlightNumber('UAE21')).toBe('EK21');
  });

  it('returns nothing rather than inventing one', () => {
    // Ryanair and easyJet broadcast alphanumeric callsigns unrelated to the
    // number on a ticket. Showing a made-up flight number would be worse than
    // showing the callsign as it was broadcast.
    expect(callsignToFlightNumber('RYR61UR')).toBeNull();
    expect(callsignToFlightNumber('EZY32ZH')).toBeNull();
    expect(callsignToFlightNumber('GCGVT')).toBeNull();
    expect(callsignToFlightNumber('')).toBeNull();
  });

  it('does not map an airline it has no designator for', () => {
    expect(callsignToFlightNumber('ZZZ123')).toBeNull();
  });

  it('round-trips against the forward mapping', async () => {
    const { candidateCallsigns } = await import('./callsigns');
    for (const flightNumber of ['KL1038', 'BA9270', 'EK21', 'LH2508']) {
      const callsign = candidateCallsigns(flightNumber).find((c) => /^[A-Z]{3}\d+$/.test(c));
      expect(callsign).toBeDefined();
      expect(callsignToFlightNumber(callsign!)).toBe(flightNumber);
    }
  });
});
