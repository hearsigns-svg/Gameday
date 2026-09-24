// Switching between one calendar and a calendar per sport, killed at every
// single side effect (owner brief 2026-09-24): "the move must survive the
// app being closed partway: it resumes on the next open, and no event ends
// up duplicated or missing."
//
// A faithful model of the engine's pass — drain the leftovers, plan the
// relocation from the ledger, move, prune every calendar of ours, sweep
// the empty ones — run against a model calendar store that dies after N
// side effects, then re-run until done.
import { drainStrayEvents, relocate, RelocationDeps } from '../layoutRelocation';
import {
  CalendarLayout,
  Placement,
  planLayoutRelocation,
  unreferencedCalendarIds,
} from '../../domain/sportCalendars';
import { Ledger, LedgerEntry } from '../../domain/syncPlan';

const HOME = 'home';
class Kill extends Error {}

interface World {
  ledger: Ledger;
  calendars: Map<string, Map<string, string>>; // calendarId → eventId → fixtureId
  sportMap: Record<string, string>; // recorded sport calendars
  seq: number;
}

// 4 soccer, 3 basketball, 2 motorsport (F1 and MotoGP share one), 1 Olympic.
const SPORT: Record<string, string> = {
  'fd-1': 'soccer', 'fd-2': 'soccer', 'fd-3': 'soccer', 'fd-4': 'soccer',
  'nba-1': 'basketball', 'nba-2': 'basketball', 'nba-3': 'basketball',
  'f1-1': 'motorsport', 'motogp-1': 'motorsport',
  'oly-1': 'olympics',
};

function entry(eventId: string, calendarId: string, sport?: string): LedgerEntry {
  return {
    eventId,
    calendarId,
    startUtc: '2026-10-21T11:30:00.000Z',
    endUtc: '2026-10-21T13:30:00.000Z',
    title: eventId,
    allDay: false,
    ...(sport ? { sport } : {}),
  };
}

function combinedWorld(): World {
  const cal = new Map<string, string>();
  const ledger: Ledger = {};
  for (const fixtureId of Object.keys(SPORT)) {
    cal.set(`e-${fixtureId}`, fixtureId);
    ledger[fixtureId] = entry(`e-${fixtureId}`, HOME, SPORT[fixtureId]);
  }
  return { ledger, calendars: new Map([[HOME, cal]]), sportMap: {}, seq: 0 };
}

function clone(w: World): World {
  return {
    ledger: { ...w.ledger },
    calendars: new Map([...w.calendars].map(([k, v]) => [k, new Map(v)])),
    sportMap: { ...w.sportMap },
    seq: w.seq,
  };
}

function placementIn(w: World, layout: CalendarLayout) {
  return (_id: string, e: LedgerEntry): Placement | null => {
    if (layout === 'combined') return { calendarId: HOME };
    const group = e.sport;
    if (!group) return null;
    const id = w.sportMap[group];
    return id ? { calendarId: id, group } : { calendarId: null, group };
  };
}

// One pass. `budget` = side effects allowed before the app "dies".
async function pass(w: World, layout: CalendarLayout, budget = Infinity): Promise<void> {
  let spent = 0;
  const spend = () => {
    if (++spent > budget) throw new Kill();
  };
  const deleteEvent = async (eventId: string) => {
    spend();
    for (const cal of w.calendars.values()) cal.delete(eventId);
    return { ok: true as const, value: true as const };
  };
  const deps: RelocationDeps = {
    ledger: () => w.ledger,
    upsert: (fixtureId, e) => {
      spend();
      w.ledger = { ...w.ledger, [fixtureId]: e };
    },
    calendarFor: async (to) => {
      if (to.calendarId !== null) return { ok: true, value: to.calendarId };
      spend(); // the native create
      const id = `cal-${to.group}-${w.seq++}`;
      w.calendars.set(id, new Map());
      spend(); // recording it (a kill here leaves an unrecorded calendar)
      w.sportMap = { ...w.sportMap, [to.group]: id };
      return { ok: true, value: id };
    },
    create: async (calendarId, step) => {
      spend();
      const id = `e-${step.fixtureId}-${w.seq++}`;
      w.calendars.get(calendarId)!.set(id, step.fixtureId);
      return { ok: true, value: { eventId: id } };
    },
    deleteEvent: (eventId) => deleteEvent(eventId),
    stop: () => false,
    beat: () => undefined,
  };
  if (layout === 'combined' && !w.calendars.has(HOME)) {
    spend();
    w.calendars.set(HOME, new Map()); // ensureCalendarTarget recreates it
  }
  await drainStrayEvents(deps);
  await relocate(planLayoutRelocation(w.ledger, placementIn(w, layout)), deps);
  // Prune: every calendar of ours — recorded or not — sheds events no
  // ledger entry references.
  const ledgered = new Set(Object.values(w.ledger).map((e) => e.eventId));
  for (const cal of w.calendars.values()) {
    for (const eventId of [...cal.keys()]) if (!ledgered.has(eventId)) await deleteEvent(eventId);
  }
  // Sweep: unreferenced AND empty calendars of ours go (home only while
  // it is not the layout's calendar).
  const candidates = [...w.calendars.keys()].filter((id) => id !== HOME || layout === 'per-sport');
  for (const id of unreferencedCalendarIds(w.ledger, candidates)) {
    if ((w.calendars.get(id)?.size ?? 0) > 0) continue;
    spend();
    w.calendars.delete(id);
    for (const [g, cid] of Object.entries(w.sportMap)) {
      if (cid === id) {
        const { [g]: _gone, ...rest } = w.sportMap;
        w.sportMap = rest;
      }
    }
  }
}

async function runToCompletion(w: World, layout: CalendarLayout) {
  for (let i = 0; i < 5; i++) await pass(w, layout);
}

function expectConverged(w: World, layout: CalendarLayout) {
  const seen = new Map<string, number>();
  for (const cal of w.calendars.values()) {
    for (const fixtureId of cal.values()) seen.set(fixtureId, (seen.get(fixtureId) ?? 0) + 1);
  }
  // Every game exactly once — none duplicated, none missing.
  for (const fixtureId of Object.keys(SPORT)) expect([fixtureId, seen.get(fixtureId)]).toEqual([fixtureId, 1]);
  expect(seen.size).toBe(Object.keys(SPORT).length);
  for (const [fixtureId, e] of Object.entries(w.ledger)) {
    expect(e.strayEventId).toBeUndefined();
    expect(w.calendars.get(e.calendarId)?.get(e.eventId)).toBe(fixtureId);
    if (layout === 'combined') expect(e.calendarId).toBe(HOME);
    else expect(e.calendarId).toBe(w.sportMap[SPORT[fixtureId]]);
  }
  // No empty calendar left behind, and one per sport in use.
  for (const [id, cal] of w.calendars) expect([id, cal.size > 0]).toEqual([id, true]);
  if (layout === 'per-sport') {
    expect(Object.keys(w.sportMap).sort()).toEqual(['basketball', 'motorsport', 'olympics', 'soccer']);
    expect(w.calendars.size).toBe(4);
  } else {
    expect(w.calendars.size).toBe(1);
  }
}

test('on, then off: every game moves, once, and the emptied calendars go', async () => {
  const w = combinedWorld();
  await runToCompletion(w, 'per-sport');
  expectConverged(w, 'per-sport');
  await runToCompletion(w, 'combined');
  expectConverged(w, 'combined');
});

describe('killed after every single side effect, then reopened', () => {
  for (const layoutPair of [
    ['combined', 'per-sport'],
    ['per-sport', 'combined'],
  ] as const) {
    const [from, to] = layoutPair;
    test(`${from} → ${to}`, async () => {
      // Count the side effects of an uninterrupted switch, then kill at each.
      let total = 0;
      {
        const w = combinedWorld();
        if (from === 'per-sport') await runToCompletion(w, 'per-sport');
        for (;;) {
          try {
            await pass(clone(w), to, total);
            break;
          } catch (e) {
            if (!(e instanceof Kill)) throw e;
            total++;
          }
        }
      }
      expect(total).toBeGreaterThan(20);
      for (let kill = 0; kill <= total; kill++) {
        const w = combinedWorld();
        if (from === 'per-sport') await runToCompletion(w, 'per-sport');
        try {
          await pass(w, to, kill);
        } catch (e) {
          if (!(e instanceof Kill)) throw e;
        }
        await runToCompletion(w, to);
        expectConverged(w, to);
      }
    });
  }
});

test('killed again and again, at random points, it still converges', async () => {
  let seed = 7;
  const rand = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
  const w = combinedWorld();
  for (let i = 0; i < 40; i++) {
    const layout: CalendarLayout = i % 10 < 5 ? 'per-sport' : 'combined';
    try {
      await pass(w, layout, Math.floor(rand() * 12));
    } catch (e) {
      if (!(e instanceof Kill)) throw e;
    }
  }
  await runToCompletion(w, 'per-sport');
  expectConverged(w, 'per-sport');
});

test('an entry whose sport is not known yet stays where it is', async () => {
  const w = combinedWorld();
  const { sport: _s, ...unknown } = w.ledger['fd-1'];
  w.ledger = { ...w.ledger, 'fd-1': unknown };
  await runToCompletion(w, 'per-sport');
  expect(w.ledger['fd-1'].calendarId).toBe(HOME);
  expect(w.calendars.get(HOME)?.size).toBe(1); // home kept: it still holds a game
});
