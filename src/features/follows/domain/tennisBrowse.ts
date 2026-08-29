// Tennis browse, as three sections. PURE.
//
// Tennis was one list: a shared Players row, then ATP and WTA lumped
// together as two rows of the same category, then every tournament in
// one undifferentiated block. That is not what tennis is. The tours are
// separate competitions with separate fields, separate rankings and —
// since Prompt 18 — MEASURABLY DIFFERENT COVERAGE, which a single
// combined note could only describe vaguely.
//
// So: ATP, WTA, and Grand Slams. The slams get their own section
// because they belong to neither tour — which the `tours` taxonomy
// already says, and the UI should not contradict its own data.
//
// PLACEMENT USES `tours` WHERE WE HAVE IT AND `coverage` WHERE WE DO
// NOT. Those two fields answer different questions (which draws a
// tournament HAS, versus which we currently hold), and 40 of 99 rows
// make no `tours` claim at all because they sit beyond the WTA feed's
// horizon. Falling back to coverage puts them where the evidence
// points, rather than dropping them out of browse entirely.

import { t } from '../../../core/i18n';

export interface TournamentLike {
  key: string;
  name: string;
  tours?: ('atp' | 'wta')[];
  coverage?: ('atp' | 'wta')[];
  startUtc: string;
  endUtc: string;
}

export interface CompetitionLike {
  key: string;
  name: string;
}

export type BrowseRow =
  | { kind: 'header'; id: string; title: string; note: string }
  | { kind: 'players'; id: string; title: string; tour: 'atp' | 'wta' }
  | { kind: 'competition'; id: string; key: string; name: string }
  // Two rows that OPEN A LIST rather than expanding inline. This is why
  // there is no "show all" collapse any more: the tournaments live
  // behind their own entry, which answers the ninety-five-rows problem
  // properly instead of hiding it six at a time.
  | { kind: 'slams'; id: string; tour: 'atp' | 'wta'; count: number }
  | { kind: 'others'; id: string; tour: 'atp' | 'wta'; count: number };

// The four majors, by canonical key. A curated fact about the sport,
// like KNOWN_JOINT in the server's taxonomy — not something to infer
// from a name containing "Open".
export const SLAM_KEYS = [
  'tennis-t-australian-open',
  'tennis-t-roland-garros',
  'tennis-t-wimbledon',
  'tennis-t-us-open',
];

// Per-section, because the tours no longer share a coverage story and a
// combined note could only be vague about both. Kept to one line each —
// the disclosure opens them on demand.
//
// The ATP/WTA text lives in the string catalog now (Round 3 Phase C;
// the 2026-08-07 "top 50, not top 100" correction rode along verbatim
// — GROUP_CAP history in the catalog's git blame if needed). Getters,
// so the language is read when a row is built, not at import time.
export const SECTION_NOTES = {
  get atp(): string {
    return t('follows.tennis.noteAtp');
  },
  get wta(): string {
    return t('follows.tennis.noteWta');
  },
  // NOT in the catalog, deliberately: no surface renders this note —
  // the slams row is an entry into a list, not a header with a
  // disclosure — and the catalog convention forbids orphan keys. It
  // moves there in the change that first renders it.
  slams:
    'All four majors run both draws. Follow one and you get the ' +
    'fortnight; follow a player and you get their matches within it.',
} as const;

// WHERE THE UNCLAIMED ROWS LAND, stated rather than left implicit: a
// tournament that makes no `tours` claim — 40 of 99, all of them ATP-feed
// events beyond the WTA API's horizon — falls back to `coverage`, which
// for every one of them is ['atp']. They appear under Other tournaments
// in the MEN'S section and nowhere else, until the women's window
// reaches them and the server can claim both.

const toursOf = (t: TournamentLike): ('atp' | 'wta')[] =>
  t.tours ?? t.coverage ?? [];

// A tournament's dates as its card subtitle ("29 Jun – 12 Jul").
// endUtc is EXCLUSIVE (the day after the final), hence the day
// subtracted before formatting; UTC because tournament bounds are
// calendar dates, not instants in the viewer's zone.
export function tournamentDateRange(startUtc: string, endUtc: string): string {
  const fmt = (ms: number) =>
    new Date(ms).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });
  return t('follows.tennis.dateRange', {
    start: fmt(Date.parse(startUtc)),
    end: fmt(Date.parse(endUtc) - 86_400_000),
  });
}

export function isSlam(key: string): boolean {
  return SLAM_KEYS.includes(key);
}

// What a tour's tournament list actually contains, split the way a
// browser asks for it: the majors, and everything else.
//
// THE MAJORS ARE IN BOTH LISTS ON PURPOSE. Both tours play them, and a
// follow made from a section is scoped to THAT tour, so the two entries
// are not one thing listed twice — they are two different
// subscriptions.
export function tournamentsFor(
  tournaments: readonly TournamentLike[],
  tour: 'atp' | 'wta',
  kind: 'slams' | 'others' | 'all',
): TournamentLike[] {
  const slams = tournaments.filter((t) => isSlam(t.key));
  if (kind === 'slams') return slams;
  const others = tournaments.filter(
    (t) => !isSlam(t.key) && toursOf(t).includes(tour),
  );
  // 'all' is the expanded tour card's one Tournaments destination
  // (Stage 6): the full list, majors leading.
  return kind === 'all' ? [...slams, ...others] : others;
}

export function tennisBrowseRows(
  competitions: readonly CompetitionLike[],
  tournaments: readonly TournamentLike[],
): BrowseRow[] {
  const slams = tournamentsFor(tournaments, 'atp', 'slams');
  // The tour's own "follow everything" row, matched by key rather than
  // by name so a relabelled competition still lands in its section.
  const comp = (needle: string): CompetitionLike | undefined =>
    competitions.find((c) => c.key === needle);

  const rows: BrowseRow[] = [];
  const section = (
    tour: 'atp' | 'wta',
    title: string,
    playersTitle: string,
    competitionKey: string,
  ): void => {
    rows.push({
      kind: 'header',
      id: `h-${tour}`,
      title,
      note: SECTION_NOTES[tour],
    });
    rows.push({
      kind: 'players',
      id: `p-${tour}`,
      title: playersTitle,
      tour,
    });
    const c = comp(competitionKey);
    if (c) {
      rows.push({ kind: 'competition', id: `c-${c.key}`, key: c.key, name: c.name });
    }
    if (slams.length > 0) {
      rows.push({ kind: 'slams', id: `slams-${tour}`, tour, count: slams.length });
    }
    const others = tournamentsFor(tournaments, tour, 'others');
    if (others.length > 0) {
      rows.push({ kind: 'others', id: `others-${tour}`, tour, count: others.length });
    }
  };

  section('atp', t('follows.tennis.atpTitle'), t('follows.athletes.players'), 'tennis-atp');
  section('wta', t('follows.tennis.wtaTitle'), t('follows.athletes.players'), 'tennis-wta');
  return rows;
}
