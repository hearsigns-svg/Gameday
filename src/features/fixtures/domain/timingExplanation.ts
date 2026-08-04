// Why this event looks the way it does in your calendar. PURE.
//
// A user seeing an all-day banner cannot tell whether we are being vague
// or the time genuinely has not been announced. We know which — it is
// the difference between `timePrecision: 'date_only'` (only the day is
// published), `'nominal'` (a real instant that is not the settled one)
// and a multi-day span, crossed with `confidence` and with whether this
// is an appearance borrowing its parent's window.
//
// THE RULES THIS ENCODES:
//   1. Say what is unknown, not that something is unknown.
//   2. Name the ORGANISER who has not announced; never blame a relay for
//      a silence that is not theirs (domain/sources.ts).
//   3. "Last checked" is a fact about OUR fetching, and it is only ever
//      said when we hold a real timestamp. No timestamp, no sentence.
//   4. NEVER guess when a time will firm up. Nothing in any payload says
//      it, so any "expected by Friday" would be invented. What we can
//      promise is the correction, which we already do.

import { TimePrecision } from './fixture';
import { dateOnlySpanDays, timePrecisionOf } from './horizon';
import { FixtureSource, sourceOf } from './sources';

// The fields an explanation is built from — structural, so the app's own
// display snapshot and a stored document are both acceptable.
export interface TimingFixture {
  id: string;
  status: string;
  timePrecision?: TimePrecision;
  confidence?: 'confirmed' | 'provisional';
  durationHours?: number;
  parentFixtureId?: string;
}

export interface TimingExplanation {
  // One line stating what IS known about the timing. Absent when the
  // time is settled and there is nothing to explain.
  headline: string | null;
  // Who published it (or has not), when the source is nameable.
  attribution: string | null;
  // "Checked 2 hours ago" — only ever from a real timestamp.
  checked: string | null;
  // True for the states where the calendar entry will change shape when
  // the time lands. Drives the standing promise line.
  willUpdate: boolean;
}

function agoLabel(fromIso: string, nowMs: number): string | null {
  const ms = nowMs - Date.parse(fromIso);
  if (!Number.isFinite(ms) || ms < 0) return null;
  const mins = Math.round(ms / 60_000);
  if (mins < 2) return 'moments ago';
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

// WHO, and only where naming them is both accurate and useful.
//
// An ORGANISER announces: "not yet announced by Premier Boxing
// Champions" tells a fan exactly whose announcement to wait for. A RELAY
// announces nothing — and its name is a PROVIDER NAME, which the brief
// rules out as something the user acts on — so about those we say only
// that nothing has been published, and name nobody.
function attributionFor(
  source: FixtureSource | null,
  subject: 'time' | 'slot' | 'confirmation',
): string | null {
  if (subject === 'confirmation') {
    return source?.kind === 'organiser'
      ? `${source.name} has not confirmed the final time yet.`
      : 'The final time has not been confirmed yet.';
  }
  const what = subject === 'slot' ? 'The order of play has' : 'A start time has';
  if (source?.kind === 'organiser') {
    return `${what} not been announced by ${source.name} yet.`;
  }
  return `${what} not been published yet.`;
}

export function explainTiming(
  f: TimingFixture,
  opts: {
    // ISO of the last confirmed successful fetch of this fixture's
    // ingest slice, or null when we genuinely do not know. Unknown is a
    // real answer and prints nothing — never a fabricated freshness.
    sliceCheckedAt?: string | null;
    nowMs?: number;
  } = {},
): TimingExplanation {
  const nowMs = opts.nowMs ?? Date.now();
  const source = sourceOf(f.id);
  const precision = timePrecisionOf(f);
  const provisional = f.confidence === 'provisional';
  const isAppearance = f.parentFixtureId !== undefined;
  const spanDays =
    precision === 'date_only' ? dateOnlySpanDays(f.durationHours) : 1;

  const checked =
    opts.sliceCheckedAt != null
      ? (() => {
          const ago = agoLabel(opts.sliceCheckedAt as string, nowMs);
          return ago ? `Checked ${ago}` : null;
        })()
      : null;

  let headline: string | null = null;
  let attribution: string | null = null;
  let willUpdate = false;

  if (f.status === 'cancelled') {
    // A cancelled fixture must never read as an event still to come —
    // and it must not promise an order of play for something that is off.
    headline = 'Cancelled — this is no longer taking place.';
    willUpdate = false;
  } else if (f.status === 'postponed') {
    // Nobody is silent here: the source DID announce a time, and then
    // said the fixture had moved. Attributing a non-announcement would
    // be wrong twice over.
    headline = 'Postponed — no new date has been published.';
    willUpdate = true;
  } else if (precision === 'date_only' && spanDays > 1) {
    // A span is not a missing kick-off — it IS the event's shape. Said
    // plainly so a fortnight-long banner does not read as a failure.
    headline = `Runs over ${spanDays} days, so it sits in your calendar as a ${spanDays}-day event.`;
    if (isAppearance && provisional) {
      headline =
        `The exact time isn't set yet, so this covers the whole event — ${spanDays} days.`;
      attribution = attributionFor(source, 'slot');
      willUpdate = true;
    }
  } else if (precision === 'date_only') {
    headline = isAppearance
      ? 'Only the day is known — this sits on the day until the order of play is published.'
      : 'Only the day is known, so this is an all-day entry rather than a time we made up.';
    attribution = attributionFor(source, isAppearance ? 'slot' : 'time');
    willUpdate = true;
  } else if (precision === 'nominal') {
    // THE TIME EXISTS — it is on this very screen — so the honest gap is
    // CONFIRMATION, not announcement. Saying "no start time has been
    // published" beside a printed start time was a straight
    // contradiction, on 3,020 future fixtures.
    headline =
      'The time shown is the published start, but it is not the settled one yet.';
    attribution = attributionFor(source, 'confirmation');
    willUpdate = true;
  } else if (provisional) {
    // Exact but provisional: a real instant we expect to move.
    headline = 'This time is confirmed for now, but it can still move.';
    willUpdate = true;
  }

  return { headline, attribution, checked, willUpdate };
}

// The standing promise, said once at the bottom of an explanation rather
// than repeated in every line. Matches NOMINAL_TIME_NOTE, which is what
// the calendar event's own description says.
export const WILL_UPDATE_NOTE =
  'Your calendar updates on its own when it changes.';
