// A separate calendar for each sport, through the REAL sync pass (owner
// brief 2026-09-24).
//
// The engine runs as shipped — survey, recovery, drain, move, guard, plan,
// apply, prune, sweep, toast — against a model calendar store that dies
// before or after any single write. The layer below is mocked; nothing
// the pass decides is. Pinned here:
//
//   switching on, then off: every game moves, once, into the right
//   calendar, and back; F1 and MotoGP share Motorsport; the Olympic
//   event goes in Olympics; the emptied calendars go (KickOffCal too);
//   a calendar goes when its sport's last event does; the app closed
//   partway resumes on the next open with nothing duplicated or missing;
//   the "done" toast says so exactly once.

import { t } from '../../../core/i18n';
import { NOMINAL_TIME_NOTE } from '../domain/syncPlan';
import type { Fixture } from '../../fixtures/domain/fixture';

jest.mock('../../../core/storage', () => {
  // JSON round-trip, as MMKV does: a value read back is a copy.
  const mem = new Map<string, string>();
  return {
    readJson: (k: string, fallback: unknown) =>
      mem.has(k) ? JSON.parse(mem.get(k) as string) : fallback,
    writeJson: (k: string, v: unknown) => void mem.set(k, JSON.stringify(v)),
    removeKey: (k: string) => void mem.delete(k),
    mockWipe: () => mem.clear(),
  };
});
jest.mock('../../../core/firebase', () => ({ functionsBaseUrl: 'https://example.invalid' }));
jest.mock('firebase/firestore', () => ({}));
jest.mock('firebase/auth', () => ({}));
jest.mock('firebase/app', () => ({}));
jest.mock('../../../core/toast', () => ({ showToast: jest.fn() }));
jest.mock('../../../core/regionStore', () => ({ activeRegion: () => 'uk-ie' }));
jest.mock('../../../core/entitlementStore', () => ({
  planEntitlement: () => ({ tier: 'premium' }),
}));
jest.mock('../data/calendarConnection', () => ({ calendarConnection: () => 'connected' }));
jest.mock('../data/calendarBackend', () => ({ activeBackend: () => 'provider' }));
jest.mock('../data/calendarChoice', () => ({
  calendarChoice: () => 'enabled',
  setCalendarChoice: () => undefined,
}));
jest.mock('../data/eventSettingsStore', () => ({
  loadEventSettings: () => mockState.eventSettings,
  pruneEventSettingsStore: () => undefined,
}));
jest.mock('../data/exclusionStore', () => ({
  loadExclusions: () => new Set(),
  pruneExclusions: () => undefined,
}));
jest.mock('../data/pinStore', () => ({
  pinFollowKeys: () => [],
  pinnedIds: () => new Set(),
  prunePinStore: () => undefined,
}));
jest.mock('../data/tournamentChildren', () => ({
  fetchTournamentChildrenFor: async () => ({ ok: true, value: { byParent: new Map() } }),
}));
jest.mock('../data/prefsStore', () => ({
  loadPrefs: () => mockState.prefs(),
}));
jest.mock('../../follows/data/followStore', () => ({
  calendarPrefOf: () => 'in',
  fixtureWantedByFollows: () => () => true,
  loadFollowables: () => mockState.followables,
  loadFollowKeys: () => mockState.follows,
  toInclusionFollow: (f: MockFollow) => ({
    key: f.key,
    type: f.type,
    calendar: f.calendar ?? 'in',
    queryKeys: [f.key],
  }),
}));
jest.mock('../../fixtures/data/fixturesRepo', () => ({
  fetchFixturesForFollows: async (keys: readonly string[]) => ({
    ok: true,
    value: {
      fixtures: mockState.fixtures.filter((f) => f.followKeys.some((k) => keys.includes(k))),
      keys: keys.length,
      chunks: 1,
    },
  }),
  fetchFixturesByIds: async (ids: readonly string[]) =>
    mockState.lookupFails
      ? { ok: false, error: { kind: 'offline' } }
      : { ok: true, value: mockState.archive.filter((f) => ids.includes(f.id)) },
  missingFixtureIds: async (ids: readonly string[]) =>
    mockState.lookupFails
      ? { ok: false, error: { kind: 'offline' } }
      : {
          ok: true,
          value: new Set(ids.filter((id) => !mockState.archive.some((f) => f.id === id))),
        },
}));
jest.mock('../data/driver', () => ({
  ensureCalendarPermission: async () => ({ ok: true, value: true }),
  hasCalendarGrant: async () => true,
  nativeSyncRoute: () => 'provider',
  applyTargetRequest: async () => ({ ok: false, error: { kind: 'unknown', message: 'n/a' } }),
  deleteVacatedCalendarIfOurs: async () => false,
  ensureCalendarTarget: () => mockStore.ensureCalendarTarget(),
  currentTargetId: () => mockStore.target,
  surveyCalendars: (c: string[], r: string[]) => mockStore.survey(c, r),
  getCalendarObject: async (id: string) => ({ ok: true, value: { kind: 'rest', calendarId: id } }),
  createFixtureEvent: (h: { calendarId: string }, input: MockInput) =>
    mockStore.createEvent(h.calendarId, input),
  updateFixtureEvent: (eventId: string, input: MockInput, calendarId?: string) =>
    mockStore.updateEvent(eventId, input, calendarId),
  deleteFixtureEvent: (eventId: string, calendarId?: string) =>
    mockStore.deleteEvent(eventId, calendarId),
  listTaggedEvents: (id: string) => mockStore.listTagged(id),
  createSportCalendar: (title: string, colour: string) => mockStore.createCalendar(title, colour),
  calendarCapabilities: () => ({ perEventColour: mockState.eventColours }),
  conformSportCalendarColours: async (want: Array<{ calendarId: string; hex: string }>) =>
    mockStore.conform(want),
  deleteSportCalendarIfEmpty: (id: string, recorded: boolean) =>
    mockStore.deleteCalendarIfEmpty(id, recorded),
  vacateTargetIfEmpty: () => mockStore.vacateTarget(),
}));

import { runSync } from '../syncEngine';
import { showToast } from '../../../core/toast';
import { loadLedger } from '../data/ledger';
import { sportCalendarIds, setPendingLayoutMove } from '../data/sportCalendarStore';
import { DEFAULT_PREFS } from '../domain/prefs';
import { CalendarLayout } from '../domain/sportCalendars';

type MockFollow = {
  key: string;
  type: 'team' | 'competition' | 'athlete' | 'series';
  sportKey: string;
  calendar?: 'in' | 'out';
  colour?: string;
};

type MockInput = {
  fixtureId: string;
  title: string;
  startUtc: string;
  endUtc: string;
  allDay: boolean;
  note?: string;
  colour?: string;
};

// ─── The model calendar store ─────────────────────────────────────────

class Kill extends Error {}

interface Ev {
  fixtureId: string;
  title: string;
  startUtc: string;
  endUtc: string;
  allDay: boolean;
  note?: string;
  colour?: string;
}
interface Cal {
  title: string;
  colour?: string;
  events: Map<string, Ev>;
}

const mockStore = {
  // 'provider': an EventKit-like store — event ids are unique store-wide
  // and every KickOffCal-titled calendar can be found. 'rest': Google's —
  // an event is addressed THROUGH its calendar (a delete aimed at the
  // wrong one answers not-found, which reads as done, and the event
  // stays), and nothing unrecorded can ever be found again.
  backend: 'provider' as 'provider' | 'rest',
  cals: new Map<string, Cal>(),
  target: null as string | null,
  seq: 0,
  budget: Infinity,
  spent: 0,
  writes: 0,
  // Google writes aimed at the wrong calendar: "not found", read as done,
  // while the event sits on in the calendar it was really in.
  misaddressed: 0,
  // The kind of the last write that COMPLETED, and whether the app died
  // after it (rather than before the next one).
  lastWrite: '',
  diedAfterWrite: false,
  // Calendars whose scan comes back empty whatever they hold.
  blind: new Set<string>(),
  // Calendars the survey wrongly reports gone (a transient not-found).
  hidden: new Set<string>(),
  creates: new Map<string, number>(),
  updates: 0,
  // Sport calendar paints the passes asked for (never a kill point: a
  // paint is idempotent and touches no event or record of ours).
  paints: [] as Array<{ calendarId: string; hex: string }>,
  conform(want: Array<{ calendarId: string; hex: string }>) {
    for (const w of want) {
      const cal = this.cals.get(w.calendarId);
      if (cal) cal.colour = w.hex;
      this.paints.push(w);
    }
  },
  // The app dies BEFORE this write, or right AFTER it — every state
  // between two writes is a kill point.
  write<T>(fn: () => T, kind = 'other'): T {
    if (++this.spent > this.budget) {
      this.diedAfterWrite = false;
      throw new Kill();
    }
    const r = fn();
    this.writes++;
    this.lastWrite = kind;
    if (++this.spent > this.budget) {
      this.diedAfterWrite = true;
      throw new Kill();
    }
    return r;
  },
  reset() {
    // (the backend is the describe block's choice, and survives a reset)
    this.cals = new Map();
    this.target = null;
    this.seq = 0;
    this.budget = Infinity;
    this.spent = 0;
    this.writes = 0;
    this.misaddressed = 0;
    this.lastWrite = '';
    this.diedAfterWrite = false;
    this.blind = new Set();
    this.hidden = new Set();
    this.creates = new Map();
    this.updates = 0;
    this.paints = [];
  },
  // The real resolution's order: the stored target; else a calendar of
  // ours already called KickOffCal (resolveOurCalendar — how a create
  // the app died before recording is adopted, not duplicated); else a
  // new one.
  async ensureCalendarTarget() {
    if (!this.target || !this.cals.has(this.target)) {
      const existing =
        this.backend === 'provider'
          ? [...this.cals.entries()].find(([, c]) => c.title === 'KickOffCal')
          : undefined;
      if (existing) {
        this.target = existing[0];
      } else {
        const id = this.write(() => {
          const cid = `cal-${this.seq++}`;
          this.cals.set(cid, { title: 'KickOffCal', events: new Map() });
          return cid;
        });
        this.target = id; // the target record: its own write, after
      }
    }
    return {
      ok: true as const,
      value: {
        calendarId: this.target,
        kind: 'ours' as const,
        label: 'KickOffCal',
        accountLabel: 'iCloud',
        sourceKind: 'cloud' as const,
      },
    };
  },
  async survey(candidates: string[], recorded: string[]) {
    const present = new Set(candidates.filter((id) => this.cals.has(id) && !this.hidden.has(id)));
    const unrecordedSport =
      this.backend === 'rest'
        ? []
        : [...this.cals.entries()]
            .filter(([id, c]) => !recorded.includes(id) && c.title.startsWith('KickOffCal · '))
            .map(([id]) => id);
    return { ok: true as const, value: { present, unrecordedSport } };
  },
  async createCalendar(title: string, colour: string) {
    const id = this.write(() => {
      const cid = `cal-${this.seq++}`;
      this.cals.set(cid, { title, colour, events: new Map() });
      return cid;
    });
    return { ok: true as const, value: id };
  },
  async createEvent(calendarId: string, input: MockInput) {
    const cal = this.cals.get(calendarId);
    if (!cal) return { ok: false as const, error: { kind: 'not-found' as const, what: 'calendar' } };
    const id = this.write(() => {
      const eid = `ev-${this.seq++}`;
      cal.events.set(eid, {
        fixtureId: input.fixtureId,
        title: input.title,
        startUtc: input.startUtc,
        endUtc: input.endUtc,
        allDay: input.allDay,
        ...(input.note ? { note: input.note } : {}),
        ...(input.colour ? { colour: input.colour } : {}),
      });
      this.creates.set(input.fixtureId, (this.creates.get(input.fixtureId) ?? 0) + 1);
      return eid;
    }, 'event-create');
    return { ok: true as const, value: id };
  },
  // The calendars an event id can be looked for in.
  addressed(calendarId: string | undefined, eventId: string): Cal[] {
    if (this.backend === 'provider') return [...this.cals.values()];
    const cal = this.cals.get(calendarId ?? this.target ?? '');
    if (!cal?.events.has(eventId) && [...this.cals.values()].some((c) => c.events.has(eventId))) {
      this.misaddressed++;
    }
    return cal ? [cal] : [];
  },
  async updateEvent(eventId: string, input: MockInput, calendarId?: string) {
    for (const cal of this.addressed(calendarId, eventId)) {
      const ev = cal.events.get(eventId);
      if (!ev) continue;
      this.updates++;
      this.write(() =>
        cal.events.set(eventId, {
          ...ev,
          title: input.title,
          startUtc: input.startUtc,
          endUtc: input.endUtc,
          allDay: input.allDay,
          ...(input.note ? { note: input.note } : {}),
          colour: input.colour, // absent = the calendar's own colour again
        }),
      );
      return { ok: true as const, value: eventId };
    }
    return { ok: false as const, error: { kind: 'not-found' as const, what: 'event' } };
  },
  async deleteEvent(eventId: string, calendarId?: string) {
    for (const cal of this.addressed(calendarId, eventId)) {
      if (cal.events.has(eventId)) this.write(() => cal.events.delete(eventId));
    }
    return { ok: true as const, value: true as const };
  },
  async listTagged(id: string) {
    const cal = this.cals.get(id);
    if (!cal) return { ok: false as const, error: { kind: 'not-found' as const, what: 'calendar' } };
    if (this.blind.has(id)) return { ok: true as const, value: [] };
    return {
      ok: true as const,
      value: [...cal.events.entries()].map(([eventId, e]) => ({
        fixtureId: e.fixtureId,
        eventId,
        title: e.title,
        startUtc: e.startUtc,
        endUtc: e.endUtc,
        allDay: e.allDay,
      })),
    };
  },
  async deleteCalendarIfEmpty(id: string, recorded: boolean) {
    const cal = this.cals.get(id);
    if (!cal) return true;
    if (!recorded && !cal.title.startsWith('KickOffCal · ')) return false;
    if (cal.events.size > 0) return false;
    this.write(() => this.cals.delete(id));
    return true;
  },
  async vacateTarget() {
    const id = this.target;
    if (!id) return false;
    const cal = this.cals.get(id);
    if (cal && cal.events.size > 0) return false;
    this.write(() => {
      this.cals.delete(id);
      this.target = null;
    });
    return true;
  },
};

// ─── The user ─────────────────────────────────────────────────────────

const DAY = 86_400_000;
const at = (days: number, hour = 15) => {
  const d = new Date(Date.now() + days * DAY);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};

function fx(id: string, sport: string, key: string, days: number, extra: Partial<Fixture> = {}): Fixture {
  return {
    id,
    sport,
    competition: key,
    competitionId: key,
    title: `${id} title`,
    followKeys: [key],
    startUtc: at(days),
    venueTz: 'UTC',
    status: 'scheduled',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...extra,
  } as Fixture;
}

// 4 soccer (one with a kick-off not yet confirmed), 3 basketball, F1 and
// MotoGP (ONE Motorsport calendar), one Olympic event.
const UPCOMING: Fixture[] = [
  fx('fd-1', 'soccer', 'fdorg-team-64', 3),
  fx('fd-2', 'soccer', 'fdorg-team-64', 10, { timePrecision: 'nominal' }),
  fx('fd-3', 'soccer', 'fdorg-team-64', 17),
  fx('fd-4', 'soccer', 'fdorg-team-64', 24),
  fx('nba-1', 'basketball', 'tsdb-team-134860', 4),
  fx('nba-2', 'basketball', 'tsdb-team-134860', 6),
  fx('nba-3', 'basketball', 'tsdb-team-134860', 8),
  fx('f1-1', 'f1', 'f1-series-1', 12),
  fx('mgp-1', 'motorsport', 'tsdb-league-4407', 13),
  fx('oly-1', 'athletics', 'olympics-2028-athletics', 30),
];
// A finished game: already in the calendar, never fetched again — the
// move still places it, by looking it up.
const FINISHED = fx('fd-0', 'soccer', 'fdorg-team-64', -20);

const mockState = {
  layout: 'combined' as CalendarLayout,
  follows: [] as string[],
  fixtures: [] as Fixture[],
  archive: [] as Fixture[],
  lookupFails: false,
  eventSettings: {} as Record<string, { colour?: string; at: string }>,
  sportColours: {} as Record<string, string>,
  followables: [] as MockFollow[],
  eventColours: true,
  prefs() {
    return {
      ...DEFAULT_PREFS,
      separateSportCalendars: this.layout === 'per-sport',
      sportColours: this.sportColours,
    };
  },
};

const CALENDAR_OF: Record<string, string> = {
  soccer: 'KickOffCal · Football',
  basketball: 'KickOffCal · Basketball',
  motorsport: 'KickOffCal · F1 & Motorsport',
  olympics: 'KickOffCal · Olympics',
};
const GROUP_OF: Record<string, string> = {
  'fd-0': 'soccer', 'fd-1': 'soccer', 'fd-2': 'soccer', 'fd-3': 'soccer', 'fd-4': 'soccer',
  'nba-1': 'basketball', 'nba-2': 'basketball', 'nba-3': 'basketball',
  'f1-1': 'motorsport', 'mgp-1': 'motorsport',
  'oly-1': 'olympics',
};

// ─── Driving it ───────────────────────────────────────────────────────

// What the passes' prune had to clean up — expected only after the app
// died right after creating an event it had not yet recorded.
let prunedSince = 0;

async function pass(kill = Infinity): Promise<Awaited<ReturnType<typeof runSync>>> {
  mockStore.budget = mockStore.spent + kill;
  const r = await runSync();
  mockStore.budget = Infinity;
  if (r.ok) prunedSince += r.value.pruned ?? 0;
  return r;
}

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) await pass();
}

// Where each game is, by calendar title.
function where(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const cal of mockStore.cals.values()) {
    for (const e of cal.events.values()) (out[e.fixtureId] ??= []).push(cal.title);
  }
  return out;
}

// Empty calendars nothing records — what Google's store keeps when the
// app dies between creating a calendar and recording its id: REST can
// never list calendars, so nothing can find it again.
function leakedCalendars(): string[] {
  const recorded = new Set([
    ...Object.values(sportCalendarIds()),
    ...(mockStore.target ? [mockStore.target] : []),
  ]);
  return [...mockStore.cals.entries()]
    .filter(([id, c]) => c.events.size === 0 && !recorded.has(id))
    .map(([id]) => id);
}

function expectLayout(layout: CalendarLayout, opts: { leaked?: number } = {}) {
  const ids = Object.keys(GROUP_OF);
  const w = where();
  // Every game exactly once — none duplicated, none missing.
  expect(Object.keys(w).sort()).toEqual([...ids].sort());
  for (const id of ids) {
    expect([id, w[id]]).toEqual([id, [layout === 'combined' ? 'KickOffCal' : CALENDAR_OF[GROUP_OF[id]]]]);
  }
  // No calendar of ours is left empty, and none is missing from the record.
  const leaks = new Set(leakedCalendars());
  expect(leaks.size).toBeLessThanOrEqual(opts.leaked ?? 0);
  for (const [id, cal] of mockStore.cals) {
    if (!leaks.has(id)) expect([cal.title, cal.events.size > 0]).toEqual([cal.title, true]);
  }
  const ledger = loadLedger();
  expect(Object.keys(ledger).sort()).toEqual([...ids].sort());
  for (const [fixtureId, e] of Object.entries(ledger)) {
    expect(e.strayEventId).toBeUndefined();
    expect(mockStore.cals.get(e.calendarId)?.events.get(e.eventId)?.fixtureId).toBe(fixtureId);
  }
  const kept = [...mockStore.cals.entries()].filter(([id]) => !leaks.has(id));
  if (layout === 'per-sport') {
    expect(kept.map(([, c]) => c.title).sort()).toEqual(Object.values(CALENDAR_OF).sort());
    expect(Object.keys(sportCalendarIds()).sort()).toEqual(Object.keys(CALENDAR_OF).sort());
    expect(mockStore.target).toBeNull(); // KickOffCal itself went, emptied
  } else {
    expect(kept.length).toBe(1);
    expect(sportCalendarIds()).toEqual({});
  }
  // Every Google write found its event in the calendar it named.
  expect(mockStore.misaddressed).toBe(0);
  // "Time not confirmed" survived every move.
  const fd2 = [...mockStore.cals.values()].flatMap((c) => [...c.events.values()]).find((e) => e.fixtureId === 'fd-2');
  expect(fd2?.note).toBe(NOMINAL_TIME_NOTE);
}

const toasts = () =>
  (showToast as jest.Mock).mock.calls.map((c) => (c[0] as { message: string }).message);
const SEPARATED = () => t('calendar.layout.separated');
const COMBINED = () => t('calendar.layout.combined');

// The user switches, confirming the move (PreferencesScreen's commit).
function switchTo(layout: CalendarLayout) {
  mockState.layout = layout;
  setPendingLayoutMove(layout);
}

// A combined calendar holding every game, the finished one included.
async function combinedWorld(): Promise<void> {
  mockStore.reset();
  (jest.requireMock('../../../core/storage') as { mockWipe: () => void }).mockWipe();
  mockState.layout = 'combined';
  mockState.follows = [...new Set(UPCOMING.flatMap((f) => f.followKeys))];
  mockState.fixtures = [...UPCOMING];
  mockState.archive = [FINISHED, ...UPCOMING];
  mockState.lookupFails = false;
  mockState.eventSettings = {};
  mockState.sportColours = {};
  mockState.followables = [];
  mockState.eventColours = true;
  await settle();
  const ledgerKey = 'ledger.v1';
  const storage = jest.requireMock('../../../core/storage') as {
    readJson: (k: string, f: unknown) => Record<string, Record<string, unknown>>;
    writeJson: (k: string, v: unknown) => void;
  };
  const ledger = storage.readJson(ledgerKey, {});
  // Every entry as an older build wrote it: no sport, no note recorded.
  for (const e of Object.values(ledger)) {
    delete e.sport;
    delete e.note;
  }
  // …plus a game synced while it was upcoming, finished since: the
  // horizon rule never touches it again, and the fetch never returns it.
  const home = mockStore.target as string;
  mockStore.cals.get(home)?.events.set('ev-past', {
    fixtureId: FINISHED.id,
    title: FINISHED.title,
    startUtc: FINISHED.startUtc,
    endUtc: at(-20, 17),
    allDay: false,
  });
  ledger[FINISHED.id] = {
    eventId: 'ev-past',
    calendarId: home,
    startUtc: FINISHED.startUtc,
    endUtc: at(-20, 17),
    title: FINISHED.title,
    allDay: false,
    reminderMinutes: DEFAULT_PREFS.reminderMinutes,
  };
  storage.writeJson(ledgerKey, ledger);
  (showToast as jest.Mock).mockClear();
}

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe.each(['provider', 'rest'] as const)('%s calendar store', (backend) => {
  beforeEach(() => {
    mockStore.backend = backend;
  });

  test('switching on, then off: every game moves once, into the right calendar, and back', async () => {
    await combinedWorld();
    expectLayout('combined');
    const before = Object.keys(where()).length;

    switchTo('per-sport');
    await settle();
    expectLayout('per-sport');
    expect(Object.keys(where()).length).toBe(before);
    // Each calendar was created in its sport's colour.
    const colours = Object.fromEntries([...mockStore.cals.values()].map((c) => [c.title, c.colour]));
    expect(colours).toEqual({
      'KickOffCal · Football': '#16A34A',
      'KickOffCal · Basketball': '#EA580C',
      'KickOffCal · F1 & Motorsport': '#DC2626',
      'KickOffCal · Olympics': '#C026D3',
    });
    expect(toasts()).toEqual([SEPARATED()]);

    switchTo('combined');
    await settle();
    expectLayout('combined');
    expect(Object.keys(where()).length).toBe(before);
    expect(toasts()).toEqual([SEPARATED(), COMBINED()]);
  });

  test('a sport’s calendar goes when its last event does — and comes back with its next one', async () => {
    await combinedWorld();
    switchTo('per-sport');
    await settle();
    // The Olympic event is the only one in its calendar; the follow leaves.
    mockState.follows = mockState.follows.filter((k) => k !== 'olympics-2028-athletics');
    mockState.fixtures = UPCOMING.filter((f) => f.id !== 'oly-1');
    prunedSince = 0;
    await settle();
    // The delete itself removed it, from the calendar it was in — the
    // prune had nothing to clean up after it.
    expect(mockStore.misaddressed).toBe(0);
    expect(prunedSince).toBe(0);
    const titles = () => [...mockStore.cals.values()].map((c) => c.title);
    expect(titles()).not.toContain('KickOffCal · Olympics');
    expect(sportCalendarIds().olympics).toBeUndefined();
    // Re-followed: the calendar is created again, for its first event.
    mockState.follows = [...mockState.follows, 'olympics-2028-athletics'];
    mockState.fixtures = [...UPCOMING];
    await settle();
    expect(titles()).toContain('KickOffCal · Olympics');
    expect(where()['oly-1']).toEqual(['KickOffCal · Olympics']);
  });

  test('a sport calendar deleted by hand is recreated, and its games with it', async () => {
    await combinedWorld();
    switchTo('per-sport');
    await settle();
    const nbaId = sportCalendarIds().basketball;
    mockStore.cals.delete(nbaId); // the user deleted it in their calendar app
    await settle();
    expectLayout('per-sport');
    expect(sportCalendarIds().basketball).not.toBe(nbaId);
  });

  describe('closed partway, then reopened: the move finishes cleanly', () => {
    for (const [from, to] of [
      ['combined', 'per-sport'],
      ['per-sport', 'combined'],
    ] as const) {
      test(`${from} → ${to}, killed at every write`, async () => {
        // How many kill points an uninterrupted switch has.
        await combinedWorld();
        if (from === 'per-sport') {
          switchTo('per-sport');
          await settle();
        }
        switchTo(to);
        const spentBefore = mockStore.spent;
        await settle();
        const total = mockStore.spent - spentBefore;
        expect(total).toBeGreaterThan(40);

        const leakedAt: number[] = [];
        for (let kill = 0; kill <= total; kill++) {
          await combinedWorld();
          if (from === 'per-sport') {
            switchTo('per-sport');
            await settle();
            (showToast as jest.Mock).mockClear();
          }
          switchTo(to);
          await pass(kill); // the app dies here
          const orphanPossible = mockStore.diedAfterWrite && mockStore.lastWrite === 'event-create';
          prunedSince = 0;
          await settle(); // …and is opened again
          // The drain, not the prune, cleans up after a kill: the prune
          // only ever meets an event created and not yet recorded.
          expect([kill, prunedSince]).toEqual([kill, orphanPossible ? 1 : 0]);
          const leaked = leakedCalendars().length;
          if (leaked > 0) leakedAt.push(kill);
          // Google: a calendar created in the instant before its id was
          // recorded stays behind, empty (the scope cannot list calendars).
          // Every GAME is still exactly where it belongs.
          expectLayout(to, { leaked: backend === 'rest' ? 1 : 0 });
          // Announced once, however the move was split.
          expect([kill, toasts()]).toEqual([kill, [to === 'per-sport' ? SEPARATED() : COMBINED()]]);
        }
        // …and only at those instants: one per calendar the switch creates.
        expect(leakedAt.length).toBe(
          backend === 'provider' ? 0 : to === 'per-sport' ? Object.keys(CALENDAR_OF).length : 1,
        );
      });
    }
  });

  test('killed again and again at random points while the user flips back and forth, it still converges', async () => {
    await combinedWorld();
    let seed = 11;
    const rand = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
    for (let i = 0; i < 30; i++) {
      if (i % 6 === 0) switchTo(i % 12 === 0 ? 'per-sport' : 'combined');
      await pass(Math.floor(rand() * 20));
    }
    switchTo('per-sport');
    await settle();
    expectLayout('per-sport');
  });

  test('switching with the ledger in place never recreates KickOffCal in the per-sport layout', async () => {
    await combinedWorld();
    switchTo('per-sport');
    await settle();
    const writes = mockStore.writes;
    await settle(); // steady state: nothing to write at all
    expect(mockStore.writes).toBe(writes);
    expect([...mockStore.cals.values()].map((c) => c.title)).not.toContain('KickOffCal');
  });

  test('a sport calendar wrongly reported gone: its games still leave it — none left behind twice', async () => {
    await combinedWorld();
    switchTo('per-sport');
    await settle();
    const soccer = sportCalendarIds().soccer;
    mockStore.hidden.add(soccer); // one survey says "not found"
    await pass();
    mockStore.hidden.clear();
    await settle();
    // Every game once, in a Football calendar; the old one is emptied —
    // and on Google, where nothing unrecorded can be found again, it
    // stays behind empty.
    expectLayout('per-sport', { leaked: backend === 'rest' ? 1 : 0 });
    expect(mockStore.cals.get(soccer)?.events.size ?? 0).toBe(0);
  });

  // The fixture card's per-event colour row (owner ruling 2026-09-24): a
  // trial or Premium user's pick is saved to the event settings, and the
  // next pass recolours that one event — as before the row was locked.
  test('a colour picked on the fixture card recolours its event; clearing it restores the calendar colour', async () => {
    await combinedWorld();
    const eventOf = (id: string) =>
      [...mockStore.cals.values()].flatMap((c) => [...c.events.values()]).find((e) => e.fixtureId === id);
    const writes = mockStore.writes;
    mockState.eventSettings = { 'fd-1': { colour: '#C22A2A', at: new Date().toISOString() } };
    await pass();
    expect(eventOf('fd-1')?.colour).toBe('#C22A2A');
    expect(mockStore.writes).toBe(writes + 1); // that one event, nothing else
    for (const f of UPCOMING.filter((x) => x.id !== 'fd-1')) expect(eventOf(f.id)?.colour).toBeUndefined();
    mockState.eventSettings = {};
    await pass();
    expect(eventOf('fd-1')?.colour).toBeUndefined();
    expect(mockStore.misaddressed).toBe(0);
  });

  // ─── Colour layers (owner rulings 2026-09-25) ─────────────────────
  const GREEN = '#0B8043';
  const RED = '#D50000';
  const GRAPE = '#8E24AA';
  const eventOf = (id: string) =>
    [...mockStore.cals.values()].flatMap((c) => [...c.events.values()]).find((e) => e.fixtureId === id);
  const SOCCER_UPCOMING = ['fd-1', 'fd-2', 'fd-3', 'fd-4'];
  const NOT_SOCCER = ['nba-1', 'nba-2', 'nba-3', 'f1-1', 'mgp-1', 'oly-1'];

  test('nothing picked: a pass after the upgrade writes nothing at all', async () => {
    await combinedWorld();
    const writes = mockStore.writes;
    await pass();
    expect(mockStore.writes).toBe(writes);
  });

  test('one calendar: a sport’s colour paints its upcoming events, and only those; clearing it takes it off', async () => {
    await combinedWorld();
    const writes = mockStore.writes;
    mockState.sportColours = { soccer: GREEN };
    await pass();
    for (const id of SOCCER_UPCOMING) expect([id, eventOf(id)?.colour]).toEqual([id, GREEN]);
    for (const id of NOT_SOCCER) expect([id, eventOf(id)?.colour]).toEqual([id, undefined]);
    // A finished game is frozen (the horizon rule): never recoloured.
    expect(eventOf('fd-0')?.colour).toBeUndefined();
    expect(mockStore.writes).toBe(writes + SOCCER_UPCOMING.length);
    mockState.sportColours = {};
    await pass();
    for (const id of SOCCER_UPCOMING) expect([id, eventOf(id)?.colour]).toEqual([id, undefined]);
    expect(mockStore.misaddressed).toBe(0);
  });

  test('a follow’s colour beats its sport’s, and an event’s own beats both', async () => {
    await combinedWorld();
    mockState.sportColours = { soccer: GREEN };
    mockState.followables = [{ key: 'fdorg-team-64', type: 'team', sportKey: 'soccer', colour: RED }];
    mockState.eventSettings = { 'fd-3': { colour: GRAPE, at: new Date().toISOString() } };
    await pass();
    expect(['fd-1', 'fd-2', 'fd-4'].map((id) => eventOf(id)?.colour)).toEqual([RED, RED, RED]);
    expect(eventOf('fd-3')?.colour).toBe(GRAPE);
  });

  test('a calendar for each sport: the sport’s colour is its calendar’s, and the move writes each game once', async () => {
    await combinedWorld();
    mockState.sportColours = { soccer: GREEN };
    await pass(); // the soccer games wear it, in the one calendar
    expect(eventOf('fd-1')?.colour).toBe(GREEN);
    mockStore.creates.clear();
    const updates = mockStore.updates;
    switchTo('per-sport');
    await settle();
    expectLayout('per-sport');
    const football = [...mockStore.cals.values()].find((c) => c.title === CALENDAR_OF.soccer);
    expect(football?.colour).toBe(GREEN);
    // The events carry none of their own — they wear the calendar's…
    for (const id of SOCCER_UPCOMING) expect([id, eventOf(id)?.colour]).toEqual([id, undefined]);
    // …and got there in ONE write each: rebuilt without it, not rebuilt
    // with it and then rewritten.
    for (const id of Object.keys(GROUP_OF)) expect([id, mockStore.creates.get(id)]).toEqual([id, 1]);
    expect(mockStore.updates).toBe(updates);
  });

  test('picked while each sport has its calendar: that calendar is painted, no event is touched', async () => {
    await combinedWorld();
    switchTo('per-sport');
    await settle();
    const writes = mockStore.writes;
    mockState.sportColours = { basketball: GRAPE };
    await pass();
    const basketball = [...mockStore.cals.entries()].find(([, c]) => c.title === CALENDAR_OF.basketball);
    expect(basketball?.[1].colour).toBe(GRAPE);
    expect(mockStore.paints).toContainEqual({ calendarId: basketball?.[0], hex: GRAPE });
    expect(mockStore.writes).toBe(writes);
  });

  test('back to one calendar: the sport’s colour goes onto its events', async () => {
    await combinedWorld();
    mockState.sportColours = { soccer: GREEN };
    switchTo('per-sport');
    await settle();
    switchTo('combined');
    await settle();
    expectLayout('combined');
    for (const id of SOCCER_UPCOMING) expect([id, eventOf(id)?.colour]).toEqual([id, GREEN]);
    for (const id of NOT_SOCCER) expect([id, eventOf(id)?.colour]).toEqual([id, undefined]);
  });

  test('a calendar layer that cannot colour one event paints none, whatever is picked', async () => {
    await combinedWorld();
    mockState.eventColours = false;
    mockState.sportColours = { soccer: GREEN };
    mockState.followables = [{ key: 'fdorg-team-64', type: 'team', sportKey: 'soccer', colour: RED }];
    const writes = mockStore.writes;
    await pass();
    expect(mockStore.writes).toBe(writes);
    for (const id of SOCCER_UPCOMING) expect(eventOf(id)?.colour).toBeUndefined();
  });

  test('the "done" toast waits for the last game: a failed lookup holds it back a pass', async () => {
    await combinedWorld();
    mockState.lookupFails = true; // the finished game's sport cannot be read yet
    switchTo('per-sport');
    await pass();
    expect(where()['fd-0']).toEqual(['KickOffCal']); // not placed — so not done
    expect(toasts()).toEqual([]);
    mockState.lookupFails = false;
    await settle();
    expectLayout('per-sport');
    expect(toasts()).toEqual([SEPARATED()]);
  });

  test('a game that changes during the move is rebuilt once, then updated in its new calendar', async () => {
    await combinedWorld();
    mockStore.creates.clear();
    // The kick-off of fd-3 moves in the same pass as the switch.
    mockState.fixtures = UPCOMING.map((f) => (f.id === 'fd-3' ? { ...f, startUtc: at(18) } : f));
    switchTo('per-sport');
    await pass();
    for (const id of Object.keys(GROUP_OF)) {
      expect([id, mockStore.creates.get(id)]).toEqual([id, 1]);
    }
    const fd3 = [...mockStore.cals.values()]
      .flatMap((c) => [...c.events.values()])
      .filter((e) => e.fixtureId === 'fd-3');
    expect(fd3.map((e) => e.startUtc)).toEqual([at(18)]);
    mockState.fixtures = [...UPCOMING];
  });

  test('a sport calendar whose scan comes back blind fails the pass — nothing is deleted on its say-so', async () => {
    await combinedWorld();
    switchTo('per-sport');
    await settle();
    mockStore.blind.add(sportCalendarIds().soccer);
    const writes = mockStore.writes;
    const r = await pass();
    expect(r).toEqual({ ok: false, error: { kind: 'scan-anomaly', scanned: 0, ledgerEntries: 5 } });
    expect(mockStore.writes).toBe(writes);
    mockStore.blind.clear();
    await settle();
    expectLayout('per-sport');
  });
});

// A finished game the app can no longer verify — its fixture record is
// gone — is removed on every sync, in either layout (owner ruling
// 2026-09-24, the future-only rule's one deliberate exception).
describe.each(['provider', 'rest'] as const)('%s store: a finished game whose record is gone', (backend) => {
  beforeEach(() => {
    mockStore.backend = backend;
  });

  // Finished games synced while upcoming, in the combined calendar.
  function seedFinished(ids: string[]) {
    const home = mockStore.target as string;
    const storage = jest.requireMock('../../../core/storage') as {
      readJson: (k: string, f: unknown) => Record<string, unknown>;
      writeJson: (k: string, v: unknown) => void;
    };
    const ledger = storage.readJson('ledger.v1', {});
    for (const id of ids) {
      const eventId = `ev-${id}`;
      mockStore.cals.get(home)?.events.set(eventId, {
        fixtureId: id,
        title: `${id} title`,
        startUtc: at(-40),
        endUtc: at(-40, 17),
        allDay: false,
      });
      ledger[id] = {
        eventId,
        calendarId: home,
        startUtc: at(-40),
        endUtc: at(-40, 17),
        title: `${id} title`,
        allDay: false,
        reminderMinutes: DEFAULT_PREFS.reminderMinutes,
      };
    }
    storage.writeJson('ledger.v1', ledger);
  }

  // Background reruns (a capped pass queues one) run on microtasks here;
  // one macrotask turn lets every one of them finish.
  const idle = () => new Promise((resolve) => setImmediate(resolve));

  test('combined: removed on the next ordinary sync — no switch involved', async () => {
    await combinedWorld();
    const before = Object.keys(where()).length;
    mockState.archive = UPCOMING; // fd-0's record is gone (re-keyed, say)
    const r = await pass();
    expect(r.ok && r.value.recordGone).toBe(1);
    expect(where()['fd-0']).toBeUndefined();
    expect(loadLedger()['fd-0']).toBeUndefined();
    expect(Object.keys(where()).length).toBe(before - 1);
    // Everything the app CAN verify is exactly where it was.
    for (const f of UPCOMING) expect(where()[f.id]).toEqual(['KickOffCal']);
    expect(mockStore.misaddressed).toBe(0);
  });

  test('per-sport: removed, and the plain KickOffCal calendar goes once empty', async () => {
    await combinedWorld();
    seedFinished(['fd-gone']);
    mockState.archive = UPCOMING; // neither fd-0 nor fd-gone can be verified
    switchTo('per-sport');
    await settle();
    expect(where()['fd-0']).toBeUndefined();
    expect(where()['fd-gone']).toBeUndefined();
    expect(mockStore.target).toBeNull();
    expect([...mockStore.cals.values()].map((c) => c.title)).not.toContain('KickOffCal');
    for (const f of UPCOMING) expect(where()[f.id]).toEqual([CALENDAR_OF[GROUP_OF[f.id]]]);
    expect(toasts()).toEqual([SEPARATED()]);
    expect(mockStore.misaddressed).toBe(0);
  });

  test('per-sport, long after the move: a record that disappears takes its finished game with it', async () => {
    await combinedWorld();
    switchTo('per-sport');
    await settle();
    expect(where()['fd-0']).toEqual(['KickOffCal · Football']);
    mockState.archive = UPCOMING;
    const r = await pass();
    expect(r.ok && r.value.recordGone).toBe(1);
    expect(where()['fd-0']).toBeUndefined();
    expect(mockStore.misaddressed).toBe(0);
  });

  test('a check that could not be made removes nothing', async () => {
    await combinedWorld();
    mockState.archive = UPCOMING;
    mockState.lookupFails = true;
    await pass();
    expect(where()['fd-0']).toEqual(['KickOffCal']);
    expect(loadLedger()['fd-0']).toBeDefined();
    mockState.lookupFails = false;
    await pass();
    expect(where()['fd-0']).toBeUndefined();
  });

  test('a finished game whose record exists is never touched', async () => {
    await combinedWorld();
    const r = await pass();
    expect(r.ok && r.value.pastChecked).toBe(1);
    expect(r.ok && r.value.recordGone).toBeUndefined();
    expect(where()['fd-0']).toEqual(['KickOffCal']);
  });

  test('a burst goes 40 a pass, the queued pass taking the rest', async () => {
    await combinedWorld();
    const burst = Array.from({ length: 45 }, (_, i) => `gone-${i}`);
    seedFinished(burst);
    const r = await pass();
    expect(r.ok && r.value.recordGone).toBe(40);
    await idle();
    for (const id of burst) expect([id, where()[id]]).toEqual([id, undefined]);
    expect(where()['fd-0']).toEqual(['KickOffCal']); // verifiable: kept
  });
});
