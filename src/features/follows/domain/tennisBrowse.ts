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
  | { kind: 'tournament'; id: string; tournament: TournamentLike }
  | { kind: 'followAll'; id: string; title: string; keys: string[] }
  | { kind: 'showAll'; id: string; tour: 'atp' | 'wta'; hidden: number };

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
export const SECTION_NOTES = {
  atp:
    'Tournament dates from the tour calendar, and match times once a ' +
    'draw is published — assembled from a ranked feed and reviewed by ' +
    'hand, so an occasional match arrives late rather than wrong. The ' +
    'top 100 are browsable; 500 are searchable.',
  wta:
    'The fullest coverage we have: tournaments, draws and order of ' +
    'play from the WTA’s own feed, so a match appears with her ' +
    'opponent as soon as the draw is made and sharpens to an exact ' +
    'time when the schedule is published.',
  slams:
    'All four majors run both draws. Follow one and you get the ' +
    'fortnight; follow a player and you get their matches within it.',
} as const;

const toursOf = (t: TournamentLike): ('atp' | 'wta')[] =>
  t.tours ?? t.coverage ?? [];

export function isSlam(key: string): boolean {
  return SLAM_KEYS.includes(key);
}

// A SECTION NOBODY CAN REACH IS NOT A SECTION. Uncollapsed, the two
// tours put 95 tournament rows between the top of the screen and the
// Grand Slams heading — "beneath them", technically, and invisible in
// practice. Each tour shows its next few and offers the rest, the same
// way the athlete lists already do ("Show all 50").
export const TOUR_PREVIEW = 6;

export function tennisBrowseRows(
  competitions: readonly CompetitionLike[],
  tournaments: readonly TournamentLike[],
  expanded: ReadonlySet<'atp' | 'wta'> = new Set(),
): BrowseRow[] {
  const slams = SLAM_KEYS.map((k) => tournaments.find((t) => t.key === k)).filter(
    (t): t is TournamentLike => t !== undefined,
  );
  const forTour = (tour: 'atp' | 'wta'): TournamentLike[] =>
    tournaments.filter((t) => !isSlam(t.key) && toursOf(t).includes(tour));
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
    const all = forTour(tour);
    const shown = expanded.has(tour) ? all : all.slice(0, TOUR_PREVIEW);
    for (const t of shown) {
      rows.push({ kind: 'tournament', id: `${tour}-${t.key}`, tournament: t });
    }
    if (shown.length < all.length) {
      rows.push({
        kind: 'showAll',
        id: `more-${tour}`,
        tour,
        hidden: all.length - shown.length,
      });
    }
  };

  section('atp', 'ATP — Men’s', 'Players', 'tennis-atp');
  section('wta', 'WTA — Women’s', 'Players', 'tennis-wta');

  // The slams last, and only if we actually hold them: a section header
  // over nothing is worse than no section.
  if (slams.length > 0) {
    rows.push({
      kind: 'header',
      id: 'h-slams',
      title: 'Grand Slams',
      note: SECTION_NOTES.slams,
    });
    rows.push({
      kind: 'followAll',
      id: 'slam-all',
      title: 'All four majors',
      keys: slams.map((t) => t.key),
    });
    for (const t of slams) {
      rows.push({ kind: 'tournament', id: `slam-${t.key}`, tournament: t });
    }
  }
  return rows;
}
