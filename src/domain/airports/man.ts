import type { AirportProfile } from '../types';

/**
 * Manchester Airport.
 *
 * Coordinates and codes are public reference data. Everything describing how
 * long something takes is a SetoffIQ assumption and is labelled as such — the
 * airport does not publish per-passenger processing times, and its FAQ
 * explicitly defers check-in timing to the airline (checked 10 September 2026):
 * "Check-in times vary by flight type, so please arrive with enough time to
 * complete check-in and security."
 */
export const MANCHESTER: AirportProfile = {
  iataCode: 'MAN',
  icaoCode: 'EGCC',
  name: 'Manchester Airport',
  country: 'United Kingdom',
  timeZone: 'Europe/London',
  latitude: 53.3537,
  longitude: -2.275,
  terminals: [
    { code: 'T1', name: 'Terminal 1' },
    { code: 'T2', name: 'Terminal 2' },
    { code: 'T3', name: 'Terminal 3' },
  ],
  pickupOptions: [
    {
      id: 'short-stay',
      label: 'Short-stay parking',
      description: 'Park in a short-stay car park and walk into the terminal.',
      meetingBufferMinutes: 12,
      costNote:
        'Short-stay parking is charged by the airport. Check the current official rates before you travel.',
    },
    {
      id: 'quick-pickup',
      label: 'Quick pickup',
      description: 'Wait nearby and collect as soon as your passenger is outside.',
      meetingBufferMinutes: 4,
      costNote:
        'Terminal drop-off and pickup zones are charged by the airport. Check the current official rates before you travel.',
    },
    {
      id: 'meet-and-greet',
      label: 'Meet inside the terminal',
      description: 'Park and walk to arrivals to meet your passenger at the gate exit.',
      meetingBufferMinutes: 20,
      costNote:
        'Parking is charged by the airport. Check the current official rates before you travel.',
    },
  ],
  dropoffOptions: [
    {
      id: 'drop-off',
      label: 'Drop-off zone',
      description: 'Pull in, drop your passenger at the terminal and leave.',
      terminalBufferMinutes: 8,
      costNote:
        'Drop-off zones are charged by the airport. Check the current official rates before you travel.',
    },
    {
      id: 'parking',
      label: 'Park and walk in',
      description: 'Park, then walk to the terminal together.',
      terminalBufferMinutes: 18,
      costNote:
        'Parking is charged by the airport. Check the current official rates before you travel.',
    },
    {
      id: 'meet-and-greet',
      label: 'Park and see them off',
      description: 'Park and stay with your passenger until they go through security.',
      terminalBufferMinutes: 28,
      costNote:
        'Parking is charged by the airport. Check the current official rates before you travel.',
    },
  ],
  processingProfiles: [
    {
      route: 'domestic',
      disembarkation: { minMinutes: 5, maxMinutes: 12 },
      borderControl: { minMinutes: 0, maxMinutes: 0 },
      baggage: { minMinutes: 8, maxMinutes: 20 },
      terminalWalk: { minMinutes: 5, maxMinutes: 10 },
    },
    {
      // Baggage is counted as the wait *after* clearing border control: the
      // belt is being loaded while passengers queue, so adding the full
      // baggage wait on top of the full border wait would double-count.
      route: 'international',
      disembarkation: { minMinutes: 5, maxMinutes: 12 },
      borderControl: { minMinutes: 8, maxMinutes: 25 },
      baggage: { minMinutes: 5, maxMinutes: 18 },
      terminalWalk: { minMinutes: 6, maxMinutes: 12 },
    },
  ],
  departureBuffers: [
    { route: 'domestic', recommended: { minMinutes: 90, maxMinutes: 120 }, guidanceSource: null },
    {
      route: 'international',
      recommended: { minMinutes: 120, maxMinutes: 180 },
      guidanceSource: null,
    },
  ],
  officialLinks: [
    { label: 'Manchester Airport parking', url: 'https://www.manchesterairport.co.uk/parking/' },
    { label: 'Manchester Airport arrivals', url: 'https://www.manchesterairport.co.uk/flight-information/arrivals/' },
    { label: 'Manchester Airport departures', url: 'https://www.manchesterairport.co.uk/flight-information/departures/' },
  ],
  notes: [
    'Manchester Airport does not publish a recommended arrival time. Your airline sets check-in and bag-drop deadlines — check your ticket.',
    'Terminal arrangements at Manchester change as the airport is redeveloped. Confirm your terminal with your airline before travelling.',
  ],
};
