import { DEFAULT_AIRPORT } from '../../domain/airports';
import { formatClock, todayInZone } from '../../domain/time';
import type { TimeWindow } from '../../domain/types';
import type { JourneyPlan } from '../plan';
const zone = DEFAULT_AIRPORT.timeZone;
/** Formatting only: every instant/range/confidence comes directly from the engine. */
export function spokenClock(clock: string): string {
  const [hour, minute] = clock.split(':').map(Number);
  if (hour === 0 && minute === 0) return 'midnight';
  if (hour === 12 && minute === 0) return 'noon';
  return `${hour! % 12 || 12}${minute === 0 ? " o'clock" : minute! < 10 ? ` oh ${minute}` : ` ${minute}`} ${hour! < 12 ? 'a.m.' : 'p.m.'}`;
}
function day(at: number, now: number): string {
  const date = todayInZone(at, zone);
  const today = todayInZone(now, zone);
  if (date === today) return 'today';
  const next = new Date(`${today}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  if (date === next.toISOString().slice(0, 10)) return 'tomorrow';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(at);
}
function instant(at: number, now: number, speech: boolean): string {
  const clock = formatClock(at, zone);
  return `${speech ? spokenClock(clock) : clock} ${day(at, now)}`;
}
function windowText(window: TimeWindow, now: number, speech: boolean): string {
  if (todayInZone(window.earliest, zone) === todayInZone(window.latest, zone)) {
    const first = formatClock(window.earliest, zone);
    return `between ${speech ? spokenClock(first) : first} and ${instant(window.latest, now, speech)}`;
  }
  return `between ${instant(window.earliest, now, speech)} and ${instant(window.latest, now, speech)}`;
}
export function journeyReply(plan: JourneyPlan, speech = false): string {
  const r = plan.recommendation;
  if (r.kind === 'unavailable') return `${r.headline}. ${r.detail}`;
  if (r.advisory.kind === 'blocked')
    return `${r.advisory.headline}. ${r.advisory.detail} All times are Manchester time. ${plan.flight.message ?? ''}`.trim();
  const when = instant(r.recommendedDeparture, plan.computedAt, speech);
  const lead =
    r.advisory.kind === 'running-late'
      ? `The planned set-off time was ${when}. You're running late. ${r.advisory.detail}`
      : r.advisory.kind === 'leave-now'
        ? `It's time to set off. Your planned departure is ${when}.`
        : r.advisory.kind === 'get-ready' || r.advisory.kind === 'wait'
          ? `${r.advisory.headline}. Set off at ${when}.`
          : `Set off at ${when}.`;
  const window =
    r.kind === 'pickup'
      ? `Your passenger is estimated to be ready ${windowText(r.readiness.window, plan.computedAt, speech)}.`
      : `That aims to get you to the terminal ${windowText(r.terminalArrivalWindow, plan.computedAt, speech)}.`;
  const confidence =
    r.confidence.level === 'low'
      ? 'Confidence is low, so treat this as a planning estimate.'
      : `This is a ${r.confidence.level} confidence estimate.`;
  return `${lead} ${window} All times are Manchester time. ${confidence} ${plan.flight.message ?? ''}`.trim();
}
export function journeyExplanation(plan: JourneyPlan): string {
  const r = plan.recommendation;
  if (r.kind === 'unavailable') return `${r.headline}. ${r.detail}`;
  const basis =
    r.kind === 'pickup'
      ? `I work back from the passenger's estimated readiness window, ${windowText(r.readiness.window, plan.computedAt, false)}. Getting off the aircraft${r.readiness.route === 'international' ? ', border control' : ''} and leaving the terminal take time. Those processing times are assumptions.`
      : `I work back from the flight departure at ${instant(r.flightDeparture, plan.computedAt, false)}, allowing ${r.departureBuffer.minMinutes} to ${r.departureBuffer.maxMinutes} minutes at the airport. That's a planning allowance; check your airline's deadline.`;
  return `${basis} The drive is estimated at ${r.journey.minMinutes} to ${r.journey.maxMinutes} minutes. The engine uses the slower end of that range and the allowance for your pickup or drop-off style to set your departure at ${instant(r.recommendedDeparture, plan.computedAt, false)}. ${plan.flight.message ?? ''}`.trim();
}
/** Speak exact numbers clearly; do not ask a language model to reinterpret them. */
export function speakable(text: string): string {
  return text
    .replace(
      /\b(\d{2}:\d{2})[–−-](\d{2}:\d{2})\b/g,
      (_, first: string, last: string) =>
        `between ${spokenClock(first)} and ${spokenClock(last)}`,
    )
    .replace(/\b([01]\d|2[0-3]):([0-5]\d)\b/g, (clock) => spokenClock(clock))
    .replace(/\b(\d{4}-\d{2}-\d{2})\b/g, (date) =>
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'UTC',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(new Date(`${date}T12:00:00Z`)),
    )
    .replace(
      /\b([A-Z]{2,3})(\d{1,4})\b/g,
      (_, code: string, number: string) =>
        `${code.split('').join(' ')} ${number.split('').join(' ')}`,
    )
    .replace(/(\d)[–−](\d)/g, '$1 to $2')
    .replace(/\b([ap])\.m\.\./g, '$1.m.');
}

/** Bound model input so its tokenizer cannot silently truncate the end of an answer. */
export function speechChunks(text: string): string[] {
  const chunks: string[] = [];
  for (const sentence of text.split(/(?<=[.!?])\s+(?=[A-Z])/)) {
    let chunk = '';
    for (const word of sentence.split(/\s+/)) {
      if (chunk.length + word.length > 90 && chunk) {
        chunks.push(chunk);
        chunk = '';
      }
      chunk = chunk ? `${chunk} ${word}` : word;
    }
    if (chunk) chunks.push(chunk);
  }
  return chunks;
}
