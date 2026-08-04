// The full-card breakdown (Prompt 16 A2). Shapes measured against the
// production store on 2026-08-04: one PBC card with four bouts (one of
// them carrying `pbc-cards-main`), ten TSDB combat parents whose only
// child is the headline re-parsed from the parent's own title, and WTA
// tournaments whose appearances are stored ONE PER PLAYER, so every
// match is present twice.

import { cardEntries, cardSectionTitle, boutTimingCaption } from '../card';
import { Fixture } from '../fixture';

const CARD_START = '2026-08-22T22:00:00.000Z';

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
    const entries = cardEntries(p, [
      bout(['Victor Santillan', 'Gary Antonio Russell']),
      main,
      bout(['Carlos Utria', 'Israel Mercado']),
    ]);
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
    const entries = cardEntries(parent({ awayTeam: 'Teófimo López' }), [
      bout(['Carlos Utria', 'Israel Mercado']),
      bout(['Rolando Romero', 'Teofimo Lopez']),
    ]);
    expect(entries[0].title).toBe('Rolando Romero vs Teofimo Lopez');
    expect(entries[0].isMain).toBe(true);
    expect(entries[1].isMain).toBe(false);
  });

  it('says nothing when the only bout IS the event itself', () => {
    // The ten TSDB combat parents: their single child is the same fight
    // as the card. A "full card" repeating the headline is noise.
    expect(cardEntries(parent(), [bout(['Rolando Romero', 'Teofimo Lopez'])]))
      .toEqual([]);
  });

  it('keeps a single bout that is NOT the headline', () => {
    const entries = cardEntries(parent(), [bout(['Carlos Utria', 'Israel Mercado'])]);
    expect(entries).toHaveLength(1);
    expect(entries[0].isMain).toBe(false);
  });

  it('drops a scratched bout', () => {
    // A cancelled child under a live parent is a real stored shape.
    const entries = cardEntries(parent(), [
      bout(['Rolando Romero', 'Teofimo Lopez']),
      bout(['Carlos Utria', 'Israel Mercado']),
      bout(['Aaron McKenna', 'Etinosa Oliha'], { status: 'cancelled' }),
    ]);
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
    expect(cardEntries(p, [stray, p])).toEqual([]);
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
    const entries = cardEntries(tournament, [
      match('Moyuka Uchijima', 'Aryna Sabalenka', '2026-08-04T23:00:00.000Z'),
      match('Aryna Sabalenka', 'Moyuka Uchijima', '2026-08-04T23:00:00.000Z'),
      match('Anna Kalinskaya', 'Emma Raducanu', '2026-08-04T21:00:00.000Z'),
    ]);
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
    const [entry] = cardEntries(p, [
      bout(['Carlos Utria', 'Israel Mercado']),
    ]);
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
