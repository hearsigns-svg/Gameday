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

import { t, tn } from '../../../core/i18n';
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
  if (mins < 2) return t('calendar.timing.momentsAgo');
  // Always ≥ 2 here (the moments branch above owns 0–1), so this is a
  // plain template rather than a plural pair with an unreachable form.
  if (mins < 60) return t('calendar.timing.minutesAgo', { n: mins });
  const hours = Math.round(mins / 60);
  if (hours < 24) return tn('calendar.timing.hoursAgo', hours);
  const days = Math.round(hours / 24);
  return tn('calendar.timing.daysAgo', days);
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
      ? t('calendar.timing.confirmOrganiser', { source: source.name })
      : t('calendar.timing.confirmGeneric');
  }
  // Whole sentences per subject, not stitched fragments — a translator
  // has to be able to reorder the clause around the organiser's name.
  if (source?.kind === 'organiser') {
    return subject === 'slot'
      ? t('calendar.timing.slotNotAnnounced', { source: source.name })
      : t('calendar.timing.timeNotAnnounced', { source: source.name });
  }
  return subject === 'slot'
    ? t('calendar.timing.slotNotPublished')
    : t('calendar.timing.timeNotPublished');
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
          return ago ? t('calendar.timing.checked', { ago }) : null;
        })()
      : null;

  let headline: string | null = null;
  let attribution: string | null = null;
  let willUpdate = false;

  if (f.status === 'cancelled') {
    // A cancelled fixture must never read as an event still to come —
    // and it must not promise an order of play for something that is off.
    headline = t('calendar.timing.cancelled');
    willUpdate = false;
  } else if (f.status === 'postponed') {
    // Nobody is silent here: the source DID announce a time, and then
    // said the fixture had moved. Attributing a non-announcement would
    // be wrong twice over.
    headline = t('calendar.timing.postponed');
    willUpdate = true;
  } else if (precision === 'date_only' && spanDays > 1) {
    // A span is not a missing kick-off — it IS the event's shape. Said
    // plainly so a fortnight-long banner does not read as a failure.
    headline = t('calendar.timing.runsOverDays', { n: spanDays });
    if (isAppearance && provisional) {
      headline = t('calendar.timing.exactTimeNotSet', { n: spanDays });
      attribution = attributionFor(source, 'slot');
      willUpdate = true;
    }
  } else if (precision === 'date_only') {
    headline = isAppearance
      ? t('calendar.timing.dayOnlyAppearance')
      : t('calendar.timing.dayOnly');
    attribution = attributionFor(source, isAppearance ? 'slot' : 'time');
    willUpdate = true;
  } else if (precision === 'nominal') {
    // THE TIME EXISTS — it is on this very screen — so the honest gap is
    // CONFIRMATION, not announcement. Saying "no start time has been
    // published" beside a printed start time was a straight
    // contradiction, on 3,020 future fixtures.
    headline = t('calendar.timing.nominal');
    attribution = attributionFor(source, 'confirmation');
    willUpdate = true;
  } else if (provisional) {
    // Exact but provisional: a real instant we expect to move.
    headline = t('calendar.timing.provisional');
    willUpdate = true;
  }

  return { headline, attribution, checked, willUpdate };
}

// The standing promise, said once at the bottom of an explanation rather
// than repeated in every line. Matches NOMINAL_TIME_NOTE, which is what
// the calendar event's own description says.
export const WILL_UPDATE_NOTE = t('calendar.timing.willUpdate');

// ONE LINE, ON THE CARD (Prompt 16b).
//
// "Time TBC" is printed on the card, so that is where the answer to
// "why?" belongs — not in a section three scrolls down, and not as three
// stacked paragraphs. What is known, and who has not published the time.
// Nothing else: no promise of an update (the app's whole claim), no
// coverage essay, no fighter directory.
//
// Freshness earns its place in exactly ONE case: when the source is a
// relay we will not name, "checked N ago" is the only fact left to give.
export function shortTimingNote(
  f: TimingFixture,
  opts: { sliceCheckedAt?: string | null; nowMs?: number } = {},
): string | null {
  const nowMs = opts.nowMs ?? Date.now();
  const source = sourceOf(f.id);
  const precision = timePrecisionOf(f);
  const named = source?.kind === 'organiser' ? source.name : null;
  const spanDays =
    precision === 'date_only' ? dateOnlySpanDays(f.durationHours) : 1;

  if (f.status === 'cancelled') return t('calendar.timing.shortCancelled');
  if (f.status === 'postponed') return t('calendar.timing.shortPostponed');
  if (precision === 'date_only' && spanDays > 1) {
    return t('calendar.timing.runsDays', { n: spanDays });
  }
  if (precision === 'date_only' || precision === 'nominal') {
    const subject =
      f.parentFixtureId !== undefined && precision === 'date_only'
        ? t('calendar.timing.noOrderOfPlay')
        : precision === 'nominal'
          ? t('calendar.timing.noConfirmedTime')
          : t('calendar.timing.noStartTime');
    if (named) {
      return t('calendar.timing.subjectFromYet', { subject, source: named });
    }
    const ago =
      opts.sliceCheckedAt != null
        ? agoLabel(opts.sliceCheckedAt, nowMs)
        : null;
    return ago
      ? t('calendar.timing.subjectChecked', { subject, ago })
      : t('calendar.timing.subjectPublishedYet', { subject });
  }
  if (f.confidence === 'provisional') {
    return t('calendar.timing.shortProvisional');
  }
  return null;
}
