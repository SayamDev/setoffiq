import { todayInZone } from '../../domain/time';
import type { JourneyKind, PassengerRoute } from '../../domain/types';

/** Closed input vocabulary. No action contains predictions, coordinates or executable text. */
export interface VoicePatch {
  kind?: JourneyKind;
  date?: string;
  time?: string;
  flightNumber?: string;
  airline?: string;
  place?: string;
  postcode?: string;
  passengerRoute?: PassengerRoute;
  luggage?: 'checked' | 'hand-only';
  terminalCode?: string;
}
export type VoiceAction =
  | {
      type: 'update';
      patch: VoicePatch;
      ambiguousHour: boolean;
      ambiguousBasis: boolean;
      approximate: boolean;
    }
  | {
      type:
        | 'explain'
        | 'monitor'
        | 'stop'
        | 'calculate'
        | 'help'
        | 'repeat'
        | 'reset'
        | 'edit';
    }
  | { type: 'navigate'; destination: 'home' | 'journeys' | 'settings' }
  | { type: 'clarify'; message: string };
const numbers: Record<string, number> = {
  zero: 0,
  oh: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
};
const airlines: Record<string, string> = {
  ryanair: 'FR',
  easyjet: 'U2',
  emirates: 'EK',
  klm: 'KL',
  'british airways': 'BA',
  'air france': 'AF',
  'aer lingus': 'EI',
  jet2: 'LS',
};
const clarify = (message: string): VoiceAction => ({
  type: 'clarify',
  message,
});
const pad = (value: number) => String(value).padStart(2, '0');

/** English, bounded, deterministic translation only. Unknown semantics never silently become actions. */
export function parseUtterance(
  raw: string,
  now: number,
  zone = 'Europe/London',
): VoiceAction {
  if (raw.length > 500)
    return clarify('Please use one short journey instruction at a time.');
  let text = raw
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\bi am\b/g, "i'm")
    .replace(/o'clock/g, 'oclock')
    .replace(/\ba\.m\./g, 'am')
    .replace(/\bp\.m\./g, 'pm')
    .trim();
  if (!text) return clarify('Say a journey detail, or type it below.');
  if (/\b(book|pay|contact|call|email|text someone)\b/.test(text))
    return clarify(
      'I can plan a journey, but cannot book, pay or contact anyone.',
    );
  if (/^(stop|stop listening|cancel voice)[.!?]?$/.test(text))
    return { type: 'stop' };
  if (
    /^(help|what can i say|how (do i|does this) (work|use this)|help me)[.!?]?$/.test(
      text,
    )
  )
    return { type: 'help' };
  if (
    /^(repeat( that)?|say (that|it) again|read (the )?answer)[.!?]?$/.test(text)
  )
    return { type: 'repeat' };
  if (/^(start (again|over)|new journey|reset journey)[.!?]?$/.test(text))
    return { type: 'reset' };
  if (/^(edit( (the |my )?details)?|show (the |my )?details)[.!?]?$/.test(text))
    return { type: 'edit' };
  const navigation =
    /^(?:go to|open|show)(?: my| the)? (home|journeys|settings)[.!?]?$/.exec(
      text,
    );
  if (navigation)
    return {
      type: 'navigate',
      destination: navigation[1] as 'home' | 'journeys' | 'settings',
    };
  if (/\bwhy\b|explain/.test(text)) return { type: 'explain' };
  if (
    /^(start monitoring|monitor( this journey)?|watch this flight)[.!?]?$/.test(
      text,
    )
  )
    return { type: 'monitor' };
  if (
    /^(calculate|calculate now|when should i leave|when should i set off)[.!?]?$/.test(
      text,
    )
  )
    return { type: 'calculate' };
  if (/\bor\b|\bbetween\b/.test(text))
    return clarify('Please give one flight time.');
  if (
    /\b(at the terminal|arrive at the airport|be at|meet them|meeting time)\b/.test(
      text,
    )
  )
    return clarify(
      'This planner needs the flight landing or departure time, rather than your desired meeting time. What time is the flight?',
    );
  if (/\btoday\b/.test(text) && /\btomorrow\b/.test(text))
    return clarify('Please give one flight date.');
  if (/\byesterday\b|\bnot at\b|\bbut at\b|\bexcept\b/.test(text))
    return clarify(
      'Please state the replacement flight date and time directly.',
    );
  if ((text.match(/\b\d{1,2}[:.]\d{2}\b/g) ?? []).length > 1)
    return clarify('Please give one flight time.');
  const patch: VoicePatch = {};
  if (/pick.?up|picking|collect/.test(text)) patch.kind = 'pickup';
  if (
    /drop.?off|dropping|take .*airport|flight (leaves|departs)|departure/.test(
      text,
    )
  )
    patch.kind = 'dropoff';
  if (/pick.?up|picking|collect/.test(text) && patch.kind === 'dropoff')
    return clarify('Is this a pickup or a drop-off?');
  // Relative dates advance the Manchester calendar, not 24-hour durations:
  // around DST, adding 24 hours near midnight can keep or skip a local day.
  const relativeDate = (days: number): string => {
    const date = new Date(`${todayInZone(now, zone)}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  };
  const isoDate = /\b(\d{4}-\d{2}-\d{2})\b/.exec(text)?.[1];
  if (isoDate) {
    const date = new Date(`${isoDate}T12:00:00Z`);
    if (
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== isoDate
    )
      return clarify('That date is not valid. Use the date control.');
    patch.date = isoDate;
    text = text.replace(isoDate, '');
  } else if (/day after tomorrow/.test(text)) patch.date = relativeDate(2);
  else if (/tomorrow/.test(text)) patch.date = relativeDate(1);
  else if (/today|tonight/.test(text)) patch.date = todayInZone(now, zone);
  else if (
    /\b(on|next|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december)\b/.test(
      text,
    )
  )
    return clarify(
      'Use today, tomorrow, an ISO date such as 2026-10-15, or the date control.',
    );
  const postcode =
    /\b(?:postcode|starting from|start from)\s+([a-z]{1,2}\d[a-z\d]?\s*\d[a-z]{2}|[a-z]{1,2}\d[a-z\d]?)\b/i.exec(
      text,
    );
  if (postcode) {
    patch.postcode = postcode[1]!.toUpperCase();
    text = text.replace(postcode[0], '');
  }
  const airline = Object.keys(airlines).find((name) => text.includes(name));
  if (airline)
    patch.airline =
      airline === 'klm' ? 'KLM' : airline[0]!.toUpperCase() + airline.slice(1);
  // Letter-spaced airline prefixes and spoken digit sequences, never phonetic guessing.
  text = text.replace(/\b([a-z])\s+([a-z])\b/g, '$1$2');
  text = text.replace(
    /\b(zero|oh|one|two|three|four|five|six|seven|eight|nine)\b/g,
    (word) => String(numbers[word]),
  );
  const flight = [
    ...text.matchAll(/\b([a-z]{2,3}|u2)\s*((?:\d\s*){1,4})\b/g),
  ].find(
    (match) =>
      !['at', 'no', 'to', 'is', 'am', 'pm', 'the', 'for', 'off'].includes(
        match[1]!,
      ),
  );
  const airlineFlight = airline
    ? new RegExp(`${airline}\\s+((?:\\d\\s*){1,4})\\b`).exec(text)
    : null;
  if (
    flight &&
    !['at', 'no', 'to', 'is', 'am', 'pm', 'the', 'for', 'off'].includes(
      flight[1]!,
    )
  ) {
    patch.flightNumber = `${flight[1]}${flight[2]}`
      .replace(/\s/g, '')
      .toUpperCase();
    text = text.replace(flight[0], '');
  } else if (airlineFlight && airline) {
    patch.flightNumber = `${airlines[airline]}${airlineFlight[1]}`.replace(
      /\s/g,
      '',
    );
    text = text.replace(airlineFlight[0], '');
  }
  const place =
    /\b(?:from|to)\s+([\p{L}][\p{L} -]*?)(?=\s+(?:at|today|tomorrow|landing|lands|with|on|flight)|[,.;!?]|$)/u
      .exec(text)?.[1]
      ?.trim();
  if (place && !['the airport', 'manchester airport'].includes(place))
    patch.place = place[0]!.toUpperCase() + place.slice(1);
  if (/hand luggage|hand.only|no checked bags/.test(text))
    patch.luggage = 'hand-only';
  else if (/checked (bags|luggage)/.test(text)) patch.luggage = 'checked';
  if (/\bdomestic\b|within the uk/.test(text))
    patch.passengerRoute = 'domestic';
  if (/\binternational\b/.test(text)) patch.passengerRoute = 'international';
  const terminal = /\bterminal\s*(\d+)\b/.exec(text);
  if (terminal && !['1', '2', '3'].includes(terminal[1]!))
    return clarify('Choose terminal one, two or three, or leave it unknown.');
  if (terminal) {
    patch.terminalCode = `T${terminal[1]}`;
    text = text.replace(terminal[0], '');
  }
  text = text.replace(
    /\b(ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty)\b/g,
    (word) => String(numbers[word]),
  );
  let hour: number | null = null;
  let minute = 0;
  const fractional = /\b(half|quarter past|quarter to)\s+(\d{1,2})\b/.exec(
    text,
  );
  const clock = /\b(\d{1,2})[:.](\d{2})\b/.exec(text);
  const spoken =
    /\b(?:at|no[, ]*|actually|change to|time is|lands at|landing at)?\s*(\d{1,2})(?:\s+(\d{2}))?\s*(?:oclock|am|pm|in the (?:morning|evening|afternoon))?\b/.exec(
      text,
    );
  if (/midnight/.test(text)) hour = 0;
  else if (/\bnoon\b/.test(text)) hour = 12;
  else if (fractional) {
    hour = Number(fractional[2]);
    minute =
      fractional[1] === 'half'
        ? 30
        : fractional[1] === 'quarter past'
          ? 15
          : 45;
    if (fractional[1] === 'quarter to') hour = (hour + 23) % 24;
  } else if (clock) {
    hour = Number(clock[1]);
    minute = Number(clock[2]);
  } else if (spoken) {
    hour = Number(spoken[1]);
    minute = Number(spoken[2] ?? 0);
  }
  const pm = /\bpm\b|evening|afternoon|tonight/.test(text);
  const am = /\bam\b|morning/.test(text);
  if (pm && am) return clarify('Is that AM or PM?');
  const ambiguousHour =
    hour !== null &&
    hour > 0 &&
    hour <= 12 &&
    !pm &&
    !am &&
    !/noon|midnight/.test(text);
  if (hour !== null) {
    if (hour > 23 || minute > 59 || ((pm || am) && hour > 12))
      return clarify('That time is not valid. Use a time such as 18:30.');
    if (pm) hour = (hour % 12) + 12;
    if (am) hour %= 12;
    patch.time = `${pad(hour)}:${pad(minute)}`;
  }
  if (!Object.keys(patch).length)
    return clarify(
      'I did not understand a journey detail. Try “landing tomorrow at 18:30” or edit the controls.',
    );
  return {
    type: 'update',
    patch,
    ambiguousHour,
    ambiguousBasis: Boolean(
      patch.time &&
        patch.kind === 'pickup' &&
        !/land|flight arrival/.test(text),
    ),
    approximate: /about|around|roughly|approx/.test(text),
  };
}
