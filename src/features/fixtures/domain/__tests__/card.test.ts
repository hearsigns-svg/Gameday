// The full-card breakdown (Prompt 16 A2). Shapes measured against the
// production store on 2026-08-04: one PBC card with four bouts (one of
// them carrying `pbc-cards-main`), ten TSDB combat parents whose only
// child is the headline re-parsed from the parent's own title, and WTA
// tournaments whose appearances are stored ONE PER PLAYER, so every
// match is present twice.

import {
  boutTimingCaption,
  cardEntries,
  cardSectionTitle,
  entrySexOf,
  jointCardEntries,
  jointTournamentKeyOf,
} from '../card';
import { Fixture } from '../fixture';

const CARD_START = '2026-08-22T22:00:00.000Z';
// Every call passes this. `cardEntries` filters out what has already been
// played, so a suite that let it default to Date.now() would quietly stop
// testing anything the day these fixtures went past.
const NOW = Date.parse('2026-08-04T09:00:00.000Z');

function parent(overrides: Partial<Fixture> = {}): Fixture {
  return {
    id: 'pbc-fight-night-august-22-2026',
    sport: 'boxing',
    competition: 'Premier Boxing Champions',
    competitionId: 'pbc-cards',
    title: 'Rolando Romero vs Teofimo Lopez',
    homeTeam: 'Rolando Romero',
    awayTeam: 'Teofimo Lopez',
    followKeys: ['pbc-cards'],
    startUtc: CARD_START,
    status: 'scheduled',
    timePrecision: 'nominal',
    confidence: 'provisional',
    updatedAt: '2026-08-03T04:21:59.146Z',
    ...overrides,
  };
}

function bout(names: [string, string], overrides: Partial<Fixture> = {}): Fixture {
  const slug = names
    .map((n) => n.toLowerCase().replace(/[^a-z]+/g, '-'))
    .join('-');
  return {
    id: `pbc-fight-night-august-22-2026-app-${slug}`,
    sport: 'boxing',
    competition: 'Premier Boxing Champions',
    competitionId: 'pbc-cards-appearances',
    title: `${names[0]} vs ${names[1]}`,
    followKeys: ['pbc-cards-appearances'],
    athletes: [...names],
    parentFixtureId: 'pbc-fight-night-august-22-2026',
    startUtc: CARD_START,
    status: 'scheduled',
    timePrecision: 'nominal',
    confidence: 'provisional',
    updatedAt: '2026-08-03T04:21:59.146Z',
    ...overrides,
  };
}

describe('cardEntries', () => {
  it('lists every bout, main event first', () => {
    const p = parent();
    const main = bout(['Rolando Romero', 'Teofimo Lopez'], {
      followKeys: ['pbc-cards-appearances', 'pbc-cards-main'],
    });
    const entries = cardEntries(
      p,
      [
        bout(['Victor Santillan', 'Gary Antonio Russell']),
        main,
        bout(['Carlos Utria', 'Israel Mercado']),
      ],
      NOW,
    );
    expect(entries.map((e) => e.title)).toEqual([
      'Rolando Romero vs Teofimo Lopez',
      'Carlos Utria vs Israel Mercado',
      'Victor Santillan vs Gary Antonio Russell',
    ]);
    expect(entries.filter((e) => e.isMain)).toHaveLength(1);
  });

  it('finds the main event from the parent title when no key marks it', () => {
    // Measured: only ONE stored child carries a `-main` key on a parent
    // with siblings, while every future combat parent carries the
    // title-parsed pair. Accents must not defeat the match.
    const entries = cardEntries(
      parent({ awayTeam: 'Teófimo López' }),
      [
        bout(['Carlos Utria', 'Israel Mercado']),
        bout(['Rolando Romero', 'Teofimo Lopez']),
      ],
      NOW,
    );
    expect(entries[0].title).toBe('Rolando Romero vs Teofimo Lopez');
    expect(entries[0].isMain).toBe(true);
    expect(entries[1].isMain).toBe(false);
  });

  it('says nothing when the only bout IS the event itself', () => {
    // The ten TSDB combat parents: their single child is the same fight
    // as the card. A "full card" repeating the headline is noise.
    expect(
      cardEntries(parent(), [bout(['Rolando Romero', 'Teofimo Lopez'])], NOW),
    ).toEqual([]);
  });

  it('keeps a single bout that is NOT the headline', () => {
    const entries = cardEntries(
      parent(),
      [bout(['Carlos Utria', 'Israel Mercado'])],
      NOW,
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].isMain).toBe(false);
  });

  it('drops a scratched bout', () => {
    // A cancelled child under a live parent is a real stored shape.
    const entries = cardEntries(
      parent(),
      [
        bout(['Rolando Romero', 'Teofimo Lopez']),
        bout(['Carlos Utria', 'Israel Mercado']),
        bout(['Aaron McKenna', 'Etinosa Oliha'], { status: 'cancelled' }),
      ],
      NOW,
    );
    expect(entries.map((e) => e.title)).toEqual([
      'Rolando Romero vs Teofimo Lopez',
      'Carlos Utria vs Israel Mercado',
    ]);
  });

  it('ignores children of a different parent, and the parent itself', () => {
    const p = parent();
    const stray = bout(['Someone Else', 'Another Person'], {
      parentFixtureId: 'tsdb-999',
    });
    expect(cardEntries(p, [stray, p], NOW)).toEqual([]);
  });

  it('collapses tennis appearances stored once per player', () => {
    const tournament: Fixture = {
      id: 'wta-806-2026',
      sport: 'tennis',
      competition: 'National Bank Open',
      competitionId: 'tennis-wta',
      title: 'National Bank Open',
      followKeys: ['tennis-wta', 'tennis-t-national-bank-open'],
      startUtc: '2026-08-02T00:00:00.000Z',
      durationHours: 168,
      status: 'tbd',
      timePrecision: 'date_only',
      updatedAt: '2026-08-02T00:00:00.000Z',
    };
    const match = (a: string, b: string, startUtc: string): Fixture => ({
      id: `wta-806-2026-app-${a.toLowerCase().replace(/\W+/g, '-')}`,
      sport: 'tennis',
      competition: 'National Bank Open',
      competitionId: 'tennis-wta-appearances',
      title: `${a} vs ${b} — National Bank Open`,
      followKeys: ['tennis-wta-appearances'],
      athletes: [a],
      parentFixtureId: 'wta-806-2026',
      startUtc,
      status: 'scheduled',
      timePrecision: 'exact',
      confidence: 'confirmed',
      updatedAt: '2026-08-04T00:00:00.000Z',
    });
    // `now` is a PARAMETER, never the wall clock: these matches are in
    // the past by the time anyone reads this, and a test that passes
    // only on the day it was written is not a test.
    const entries = cardEntries(
      tournament,
      [
        match('Moyuka Uchijima', 'Aryna Sabalenka', '2026-08-04T23:00:00.000Z'),
        match('Aryna Sabalenka', 'Moyuka Uchijima', '2026-08-04T23:00:00.000Z'),
        match('Anna Kalinskaya', 'Emma Raducanu', '2026-08-04T21:00:00.000Z'),
      ],
      NOW,
    );
    // One row per MATCH, earliest first, nothing marked as a main event.
    expect(entries).toHaveLength(2);
    expect(entries[0].title.startsWith('Anna Kalinskaya')).toBe(true);
    expect(entries.some((e) => e.isMain)).toBe(false);
  });
});

describe('vocabulary', () => {
  it('names the list after the sport', () => {
    expect(cardSectionTitle('boxing')).toBe('Full card');
    expect(cardSectionTitle('ufc')).toBe('Full card');
    expect(cardSectionTitle('tennis')).toBe('Matches');
    expect(cardSectionTitle('athletics')).toBe('Events');
    expect(cardSectionTitle('soccer')).toBe('Also on');
  });

  it('says a bout has no time of its own rather than repeating the card time', () => {
    const p = parent();
    const [entry] = cardEntries(
      p,
      [bout(['Carlos Utria', 'Israel Mercado'])],
      NOW,
    );
    expect(boutTimingCaption(p, entry)).toBe(
      'Time within the event not published',
    );
    expect(
      boutTimingCaption(p, { ...entry, startUtc: '2026-08-22T23:30:00.000Z' }),
    ).toBeNull();
  });
});

describe('a card shows what is still to come', () => {
  it('drops matches that have already been played', () => {
    // Appearances are frozen, not deleted, so a live tournament's
    // children are mostly history: 24 of the 34 stored under
    // wta-2087-2026 on 2026-08-04 had already finished.
    const p = parent();
    const played = bout(['Carlos Utria', 'Israel Mercado'], {
      startUtc: '2026-08-01T22:00:00.000Z',
      timePrecision: 'exact',
      durationHours: 1,
    });
    const upcoming = bout(['Victor Santillan', 'Gary Antonio Russell']);
    const now = Date.parse('2026-08-22T12:00:00.000Z');
    const titles = cardEntries(p, [played, upcoming], now).map((e) => e.title);
    expect(titles).toEqual(['Victor Santillan vs Gary Antonio Russell']);
  });
});

// Round 3: the joint-tournament union (A1's second cause) and the M/W
// classifier the B4 filter rests on.
describe('jointCardEntries', () => {
  const atpParent = parent({
    id: 'tennis-usopen-atp',
    sport: 'tennis',
    competition: 'US Open',
    competitionId: 'tennis-atp',
    title: 'US Open',
    followKeys: ['tennis-atp', 'tennis-t-us-open'],
    homeTeam: undefined as never,
    awayTeam: undefined as never,
  });
  const wtaParent = parent({
    id: 'wta-905-2026',
    sport: 'tennis',
    competition: 'US Open',
    competitionId: 'tennis-wta',
    title: 'US Open',
    followKeys: ['tennis-wta', 'tennis-t-us-open'],
    homeTeam: undefined as never,
    awayTeam: undefined as never,
  });
  const match = (
    parentId: string,
    slice: string,
    names: [string, string],
  ): Fixture =>
    bout(names, {
      id: `${parentId}-app-${names[0].toLowerCase().replace(/[^a-z]+/g, '-')}`,
      competitionId: slice,
      followKeys: [slice],
      parentFixtureId: parentId,
      startUtc: '2026-08-31T15:00:00.000Z',
    });

  it('unions both tours into one card — the dedupe-hidden side returns', () => {
    const entries = jointCardEntries(
      [
        {
          parent: wtaParent,
          children: [match('wta-905-2026', 'tennis-wta-appearances', ['Anisimova', 'Krueger'])],
        },
        {
          parent: atpParent,
          children: [match('tennis-usopen-atp', 'tennis-atp-appearances', ['Alcaraz', 'Sinner'])],
        },
      ],
      NOW,
    );
    expect(entries.map((e) => e.title).sort()).toEqual([
      'Alcaraz vs Sinner',
      'Anisimova vs Krueger',
    ]);
  });

  it('one per-player duplicate across the union collapses once', () => {
    const a = match('wta-905-2026', 'tennis-wta-appearances', ['Eala', 'Stoiana']);
    const b = match('wta-905-2026', 'tennis-wta-appearances', ['Stoiana', 'Eala']);
    b.id = 'wta-905-2026-app-stoiana';
    const entries = jointCardEntries(
      [{ parent: wtaParent, children: [a, b] }],
      NOW,
    );
    expect(entries).toHaveLength(1);
  });

  it('the noise rule reads the WHOLE union, not one side', () => {
    // A combat parent whose single child is its own headline stays
    // silent alone — but with a real second side it must speak.
    const p = parent();
    const headline = bout(['Rolando Romero', 'Teofimo Lopez']);
    expect(jointCardEntries([{ parent: p, children: [headline] }], NOW)).toEqual([]);
  });
});

describe('entrySexOf', () => {
  it('classifies ONLY where the slice states it', () => {
    expect(entrySexOf({ competitionId: 'tennis-atp-appearances' })).toBe('m');
    expect(entrySexOf({ competitionId: 'tennis-wta-appearances' })).toBe('w');
    expect(entrySexOf({ competitionId: 'pbc-cards-appearances' })).toBeNull();
    expect(entrySexOf({ competitionId: 'boxingdata-cards-appearances' })).toBeNull();
  });
});

describe('jointTournamentKeyOf', () => {
  it('finds the year-agnostic tournament key and nothing else', () => {
    expect(
      jointTournamentKeyOf(['tennis-wta', 'tennis-t-us-open']),
    ).toBe('tennis-t-us-open');
    expect(jointTournamentKeyOf(['pbc-cards'])).toBeNull();
  });
});
