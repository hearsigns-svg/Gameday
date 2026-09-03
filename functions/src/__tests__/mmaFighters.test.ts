import {
  deriveMmaBrowse,
  foldMmaName,
  mmaFighterKey,
  MmaFixtureLike,
  stampMmaFighterKeys,
} from '../mmaFighters';

const card = (id: string, competition: string, start: string, home?: string, away?: string, status = 'scheduled'): MmaFixtureLike => ({
  id,
  sport: 'ufc',
  competition,
  competitionId: `tsdb-league-${competition === 'UFC' ? '4443' : '5430'}`,
  title: `${home ?? 'TBA'} vs ${away ?? 'TBA'}`,
  startUtc: start,
  status,
  followKeys: [`tsdb-league-${competition === 'UFC' ? '4443' : '5430'}`],
  ...(home ? { homeTeam: home } : {}),
  ...(away ? { awayTeam: away } : {}),
});

describe('foldMmaName / mmaFighterKey — the folded-name discipline', () => {
  it('folds case, diacritics, spacing and punctuation to one key', () => {
    expect(foldMmaName('Jon Jones')).toBe('jon-jones');
    expect(foldMmaName('  jon  JONES ')).toBe('jon-jones');
    expect(foldMmaName("Conor McGregor")).toBe('conor-mcgregor');
    expect(foldMmaName('Ilia Topuria')).toBe(foldMmaName('Ília Topuría'));
    expect(mmaFighterKey('Alex Pereira')).toBe('mma-alex-pereira');
  });
  it('refuses a one-token placeholder', () => {
    expect(mmaFighterKey('TBA')).toBeNull();
    expect(mmaFighterKey('Winner')).toBeNull();
    expect(mmaFighterKey('')).toBeNull();
  });
});

describe('stampMmaFighterKeys', () => {
  it('stamps both fighters onto an MMA card, once, and leaves other sports alone', () => {
    const c = card('ufc-1', 'UFC', '2026-09-20T02:00:00.000Z', 'Jon Jones', 'Tom Aspinall');
    const once = stampMmaFighterKeys([c]);
    expect(once[0].followKeys).toEqual(['tsdb-league-4443', 'mma-jon-jones', 'mma-tom-aspinall']);
    expect(stampMmaFighterKeys(once)).toEqual(once);
    const boxing = { ...c, sport: 'boxing' };
    expect(stampMmaFighterKeys([boxing])[0].followKeys).toEqual(['tsdb-league-4443']);
  });
  it('a card with a placeholder side stamps only the named fighter', () => {
    const c = card('ufc-2', 'UFC', '2026-09-20T02:00:00.000Z', 'Islam Makhachev', 'TBA');
    expect(stampMmaFighterKeys([c])[0].followKeys).toEqual(['tsdb-league-4443', 'mma-islam-makhachev']);
  });
});

describe('deriveMmaBrowse', () => {
  const now = '2026-09-02T12:00:00.000Z';
  const fixtures = [
    card('ufc-1', 'UFC', '2026-09-20T02:00:00.000Z', 'Jon Jones', 'Tom Aspinall'),
    card('ufc-2', 'UFC', '2026-10-04T02:00:00.000Z', 'Tom Aspinall', 'Ciryl Gane'), // Aspinall again, later
    card('pfl-1', 'PFL', '2026-09-10T00:00:00.000Z', 'Francis Ngannou', 'Renan Ferreira'),
    card('ufc-old', 'UFC', '2026-08-01T02:00:00.000Z', 'Old Fighter', 'Older Fighter'), // past
    card('ufc-x', 'UFC', '2026-09-25T02:00:00.000Z', 'Scratched Man', 'Other Guy', 'cancelled'),
  ];
  const browse = deriveMmaBrowse(fixtures, now, (f) => `pollTsdbLeague?leagueId=${f.competitionId.split('-').pop()}`, () => 42);

  it('one card per folded name, on the fighter’s NEXT card, grouped by promotion, soonest promotion first', () => {
    expect(browse.groups.map((g) => g.grouping)).toEqual(['PFL', 'UFC']);
    const ufc = browse.groups[1];
    expect(ufc.athletes.map((a) => a.name)).toEqual(['Jon Jones', 'Tom Aspinall', 'Ciryl Gane']);
    const aspinall = ufc.athletes.find((a) => a.name === 'Tom Aspinall')!;
    expect(aspinall.nextStartUtc).toBe('2026-09-20T02:00:00.000Z');
    expect(aspinall.key).toBe('mma-tom-aspinall');
    expect(aspinall.pollPath).toBe('pollTsdbLeague?leagueId=4443');
  });
  it('past and cancelled cards contribute nobody', () => {
    const names = browse.groups.flatMap((g) => g.athletes.map((a) => a.name));
    expect(names).not.toContain('Old Fighter');
    expect(names).not.toContain('Scratched Man');
  });
  it('competing soon = within a fortnight, soonest first', () => {
    expect(browse.competingSoon.map((a) => a.name)).toEqual(['Francis Ngannou', 'Renan Ferreira']);
  });
});

describe('the roster join (Round 7 item 1)', () => {
  const { stampMmaAthleteIds, mergeMmaBrowse } = require('../mmaFighters');
  const jones = { id: 'athlete_000900', displayName: 'Jon Jones', sport: 'ufc', countryCode: 'USA', accentHue: 12, grouping: 'Heavyweight', groupingKey: 'mma-heavyweight' };
  const matcher = { match: (name: string) => (/^jon jones$/i.test(name.trim()) ? jones : null) };

  it('stamps the canonical athlete id beside the folded-name key for a resolved side only', () => {
    const c = card('ufc-9', 'UFC', '2026-09-20T02:00:00.000Z', 'Jon Jones', 'Tom Aspinall');
    const once = stampMmaAthleteIds(stampMmaFighterKeys([c]), matcher);
    expect(once[0].followKeys).toEqual(['tsdb-league-4443', 'mma-jon-jones', 'mma-tom-aspinall', 'athlete_000900']);
    expect(stampMmaAthleteIds(once, matcher)).toEqual(once); // idempotent
    expect(stampMmaAthleteIds([{ ...c, sport: 'boxing' }], matcher)[0].followKeys).toEqual(['tsdb-league-4443']);
  });

  it('serves the roster divisions, keeps other promotions, re-keys competing-soon to the roster identity', () => {
    const now = '2026-09-02T12:00:00.000Z';
    const derived = deriveMmaBrowse(
      [
        card('ufc-1', 'UFC', '2026-09-10T02:00:00.000Z', 'Jon Jones', 'Tom Aspinall'),
        card('pfl-1', 'PFL', '2026-09-11T00:00:00.000Z', 'Francis Ngannou', 'Renan Ferreira'),
      ],
      now,
      () => undefined,
      () => 7,
    );
    const roster = {
      groups: [{ grouping: 'Heavyweight', groupingKey: 'mma-heavyweight', athletes: [{ key: jones.id, name: 'Jon Jones', sportKey: 'ufc' as const, accentHue: 12, grouping: 'Heavyweight' }] }],
      competingSoon: [],
    };
    const out = mergeMmaBrowse(roster, derived, matcher, () => 7);
    expect(out.groups.map((g: { groupingKey: string }) => g.groupingKey)).toEqual(['mma-heavyweight', 'mma-ufc-unlisted', 'mma-pfl']);
    // Aspinall is on a UFC card but not on the roster slice → the unlisted group, by folded key.
    expect(out.groups[1].athletes.map((a: { key: string }) => a.key)).toEqual(['mma-tom-aspinall']);
    // Competing soon: Jones under his ROSTER key and name; the rest as derived; nobody twice.
    expect(out.competingSoon.map((a: { key: string }) => a.key)).toEqual([
      'athlete_000900', 'mma-tom-aspinall', 'mma-francis-ngannou', 'mma-renan-ferreira',
    ]);
    expect(out.competingSoon[0]).toMatchObject({ name: 'Jon Jones', countryCode: 'USA', nextStartUtc: '2026-09-10T02:00:00.000Z' });
  });
});
