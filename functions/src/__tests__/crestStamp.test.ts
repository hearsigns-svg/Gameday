import { crestForSide, CrestIndex, stampCrests } from '../crestStamp';
import { Fixture } from '../fixture';
import { normaliseName } from '../identity';

const HEAT = 'https://cdn.example/heat.png';
const WOLVES = 'https://cdn.example/timberwolves.png';
const MAVS = 'https://cdn.example/mavericks.png';
const ROCKETS = 'https://cdn.example/rockets.png';

const index: CrestIndex = new Map([
  [normaliseName('Miami Heat'), [{ key: 'tsdb-team-134882', url: HEAT }]],
  [
    normaliseName('Minnesota Timberwolves'),
    [{ key: 'tsdb-team-134886', url: WOLVES }],
  ],
  [normaliseName('Dallas Mavericks'), [{ key: 'tsdb-team-134875', url: MAVS }]],
  [normaliseName('Houston Rockets'), [{ key: 'tsdb-team-134876', url: ROCKETS }]],
]);

const fixture = (over: Partial<Fixture>): Fixture => ({
  id: 'tsdb-1',
  sport: 'basketball',
  competition: 'NBA',
  competitionId: 'tsdb-league-4387',
  title: 'Miami Heat vs Minnesota Timberwolves',
  homeTeam: 'Miami Heat',
  awayTeam: 'Minnesota Timberwolves',
  followKeys: ['tsdb-team-134882', 'tsdb-team-134886', 'tsdb-league-4387'],
  startUtc: '2026-10-11T00:00:00.000Z',
  status: 'scheduled',
  updatedAt: '2026-08-27T00:00:00.000Z',
  ...over,
});

const NO_OFF = new Set<string>();

describe('crestForSide', () => {
  it('joins by name AND requires the key on the fixture itself', () => {
    expect(
      crestForSide('Miami Heat', ['tsdb-team-134882'], index, normaliseName),
    ).toBe(HEAT);
    // Name known to the directory, key NOT on the fixture: a colliding
    // name from some other slice can never stamp here.
    expect(crestForSide('Miami Heat', ['tsdb-league-4387'], index, normaliseName)).toBeNull();
  });

  it('ambiguity stamps nothing — two same-name clubs both on the fixture', () => {
    const ambiguous: CrestIndex = new Map([
      [
        normaliseName('United'),
        [
          { key: 'tsdb-team-1', url: 'https://cdn.example/a.png' },
          { key: 'tsdb-team-2', url: 'https://cdn.example/b.png' },
        ],
      ],
    ]);
    expect(
      crestForSide('United', ['tsdb-team-1', 'tsdb-team-2'], ambiguous, normaliseName),
    ).toBeNull();
    // Same name, same url twice (a club listed in two directories) is
    // not ambiguity.
    const doubled: CrestIndex = new Map([
      [
        normaliseName('United'),
        [
          { key: 'tsdb-team-1', url: 'https://cdn.example/a.png' },
          { key: 'fdorg-team-9', url: 'https://cdn.example/a.png' },
        ],
      ],
    ]);
    expect(
      crestForSide('United', ['tsdb-team-1', 'fdorg-team-9'], doubled, normaliseName),
    ).toBe('https://cdn.example/a.png');
  });

  it('a missing name stamps nothing (combat cards, individual sports)', () => {
    expect(crestForSide(undefined, ['tsdb-team-134882'], index, normaliseName)).toBeNull();
  });
});

describe('stampCrests', () => {
  it('stamps both named acceptance cards regardless of any follow', () => {
    const [heatWolves, mavsRockets] = stampCrests(
      [
        fixture({}),
        fixture({
          id: 'tsdb-2',
          title: 'Dallas Mavericks vs Houston Rockets',
          homeTeam: 'Dallas Mavericks',
          awayTeam: 'Houston Rockets',
          followKeys: ['tsdb-team-134875', 'tsdb-team-134876', 'tsdb-league-4387'],
        }),
      ],
      index,
      NO_OFF,
      normaliseName,
    );
    expect(heatWolves.homeCrestUrl).toBe(HEAT);
    expect(heatWolves.awayCrestUrl).toBe(WOLVES);
    expect(mavsRockets.homeCrestUrl).toBe(MAVS);
    expect(mavsRockets.awayCrestUrl).toBe(ROCKETS);
  });

  it('stamps partially when only one side resolves', () => {
    const [f] = stampCrests(
      [fixture({ awayTeam: 'Unknown Club' })],
      index,
      NO_OFF,
      normaliseName,
    );
    expect(f.homeCrestUrl).toBe(HEAT);
    expect(f.awayCrestUrl).toBeUndefined();
  });

  it('the kill-switch gates the stamp and clears earlier stamps', () => {
    const off = new Set(['tsdb-league-4387']);
    const [fresh] = stampCrests([fixture({})], index, off, normaliseName);
    expect(fresh.homeCrestUrl).toBeUndefined();
    const [cleared] = stampCrests(
      [fixture({ homeCrestUrl: HEAT, awayCrestUrl: WOLVES })],
      index,
      off,
      normaliseName,
    );
    expect(cleared.homeCrestUrl).toBeUndefined();
    expect(cleared.awayCrestUrl).toBeUndefined();
  });

  it('Olympic keys are excluded in code, no catalogue edit needed', () => {
    const [f] = stampCrests(
      [fixture({ competitionId: 'olympics-basketball' })],
      index,
      NO_OFF,
      normaliseName,
    );
    expect(f.homeCrestUrl).toBeUndefined();
  });

  it('combat cards stay unstamped — surnames carry no directory key', () => {
    const [f] = stampCrests(
      [
        fixture({
          sport: 'boxing',
          competitionId: 'tsdb-league-4445',
          homeTeam: 'Mayer',
          awayTeam: 'Cameron',
          followKeys: ['tsdb-league-4445'],
        }),
      ],
      index,
      NO_OFF,
      normaliseName,
    );
    expect(f.homeCrestUrl).toBeUndefined();
    expect(f.awayCrestUrl).toBeUndefined();
  });

  it('returns the SAME object when nothing changes (write-avoidance)', () => {
    const already = fixture({ homeCrestUrl: HEAT, awayCrestUrl: WOLVES });
    const [same] = stampCrests([already], index, NO_OFF, normaliseName);
    expect(same).toBe(already);
  });
});
