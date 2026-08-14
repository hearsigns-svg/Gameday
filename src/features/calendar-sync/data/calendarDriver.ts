// expo-calendar driver (SDK 57 "Calendar Next" object API).
//
// KickOffCal writes fixtures into the CALENDAR TARGET — see
// docs/CALENDAR_TARGET.md. That is a dedicated "KickOffCal" calendar
// wherever we can create one in a cloud account (iOS/iCloud, or local as
// the fallback), and the user's own Google calendar on Android, where an
// app cannot create inside a `com.google` account — only write into one.
//
// Everything we do to a calendar AS A WHOLE — rename, recolour, delete —
// is gated on the target being one WE created. Everything we do to an
// EVENT is gated on the ownership tag (domain/recovery.ts): we only ever
// touch events carrying our NOTES_TAG. Those two gates are what make it
// safe to write into somebody's real calendar.

import * as Calendar from 'expo-calendar';
import { Platform } from 'react-native';
import { AppError, err, ok, Result } from '../../../core/result';
import { palette } from '../../../core/tokens';
import { readJson, writeJson, removeKey } from '../../../core/storage';
import {
  CalendarLike,
  CreatableSource,
  chooseDefaultTarget,
  creatableSources,
  isWritable,
  sourceKindOf,
  accountLabelOf,
  SourceKind,
  mayRecolour,
} from '../domain/calendarTarget';
import { allDayAlarmMinutesBefore } from '../domain/allDayAlarm';
import { AllDayReminder } from '../domain/prefs';
import {
  fixtureIdFromNotes,
  foreignEventCount,
  NOTES_TAG,
  isEventGoneError,
  ourEventsIn,
  RecoveredEvent,
  ScannedEvent,
  scanWindows,
} from '../domain/recovery';
import {
  CalendarTarget,
  clearTarget,
  saveTarget,
  storedTarget,
  TargetKind,
} from './calendarTargetStore';

export { NOTES_TAG };

// The id of the calendar WE created, when one exists. Kept separate from
// the target: after a switch to a user calendar our own calendar may
// still be around, and it stays identifiable as ours.
const CAL_KEY = 'gamedayCalendarId.v1';
const CAL_TITLE = 'KickOffCal';
// Calendars created before the rename — matched during resolution and
// renamed in place (never duplicated, never orphaned).
const LEGACY_CAL_TITLES = ['Gameday'];

export interface ResolvedTarget {
  calendarId: string;
  kind: TargetKind;
  label: string;
  accountLabel: string;
  sourceKind: SourceKind;
}

// The native calendar object this backend threads through a sync run —
// named so the facade (data/driver.ts) can speak about it without
// importing expo-calendar itself.
export type ProviderCalendar = Calendar.ExpoCalendar;

// Non-prompting probe: reports the existing grant WITHOUT ever showing
// the OS dialog. Used as reinstall evidence — an existing grant means
// this device already opted in through the primed flow once.
export async function hasCalendarGrant(): Promise<boolean> {
  try {
    const { status } = await Calendar.getCalendarPermissions();
    return status === 'granted';
  } catch {
    return false;
  }
}

export async function ensureCalendarPermission(): Promise<Result<true>> {
  try {
    const { status } = await Calendar.requestCalendarPermissions();
    if (status !== 'granted') {
      return err<AppError>({ kind: 'permission-denied', resource: 'calendar' });
    }
    return ok(true);
  } catch (e) {
    return err({ kind: 'unknown', message: `calendar permission failed: ${e}` });
  }
}

// Search windows for tagged events. Generous on both sides so recovery
// sees every fixture we could plausibly have written — but asked for in
// chunks, because EventKit answers a span this long with an empty list
// rather than an error. See domain/recovery.ts::scanWindows.

// Platform events → the minimal shape the pure ownership gate consumes.
function toScanned(e: Calendar.ExpoCalendarEvent): ScannedEvent {
  return {
    id: e.id,
    calendarId: e.calendarId,
    notes: e.notes,
    title: e.title,
    startDate: e.startDate,
    endDate: e.endDate,
    allDay: e.allDay,
  };
}

interface CalendarScan {
  ours: RecoveredEvent[];
  foreign: number;
}

async function scanCalendar(
  calendar: Calendar.ExpoCalendar,
): Promise<CalendarScan> {
  // Windows are contiguous and their boundaries touch, so one event can
  // come back from two of them — dedupe by platform event id before the
  // ownership gate sees the list, or a boundary event would look like a
  // duplicate of itself.
  const byId = new Map<string, ScannedEvent>();
  for (const { start, end } of scanWindows()) {
    for (const e of await calendar.listEvents(start, end)) {
      const scanned = toScanned(e);
      if (!byId.has(scanned.id)) byId.set(scanned.id, scanned);
    }
  }
  const events = [...byId.values()];
  return {
    ours: ourEventsIn(events, calendar.id),
    foreign: foreignEventCount(events),
  };
}

export async function listTaggedEvents(
  calendarId: string,
): Promise<Result<RecoveredEvent[]>> {
  try {
    const calendar = await Calendar.ExpoCalendar.get(calendarId);
    return ok((await scanCalendar(calendar)).ours);
  } catch (e) {
    return err({ kind: 'unknown', message: `event scan failed: ${e}` });
  }
}

// The user's chosen calendar colour (how KickOffCal events appear in the
// OS calendar). Stored even before the calendar exists — creation and
// later changes both read it. Only ever applied to a calendar of ours:
// recolouring a user's own calendar would be vandalism.
const CAL_COLOUR_KEY = 'calendarColour.v1';

export function calendarColour(): string {
  return readJson<string>(CAL_COLOUR_KEY, palette.light.primary);
}

export type ColourOutcome = 'applied' | 'saved' | 'not-ours';

export async function setCalendarColour(hex: string): Promise<ColourOutcome> {
  writeJson(CAL_COLOUR_KEY, hex);
  const target = storedTarget();
  // OWNERSHIP PROOF, not record trust (Prompt 26 §4). The old guard
  // refused only an explicit kind:'user' record; a null record fell
  // through to the cached id, and a stale 'ours' record was trusted
  // without looking at the calendar it named — an id the platform later
  // reused for a user calendar would have been recoloured. The colour
  // still SAVES either way and lands on the next calendar we create.
  if (!target || target.kind !== 'ours') return 'not-ours';
  try {
    const cal = await Calendar.ExpoCalendar.get(target.calendarId);
    if (
      !mayRecolour(
        target,
        { id: cal.id, title: cal.title ?? '' },
        [CAL_TITLE, ...LEGACY_CAL_TITLES],
      )
    ) {
      return 'not-ours';
    }
    await cal.update({ color: hex });
    return 'applied';
  } catch {
    return 'saved'; // no permission / calendar gone — applies on next create
  }
}

// ─── What this calendar layer can actually do ─────────────────────────
//
// The UI asks THIS, never `Platform.OS`. Per-event colour is a property
// of the calendar library, not of the operating system: EventKit has no
// per-event colour at all, Android's CalendarProvider has `EVENT_COLOR`,
// and expo-calendar exposes neither — its modifiable event properties
// are title, location, timeZone, url, notes, alarms, recurrenceRule,
// availability, startDate, endDate, allDay (build/ExpoCalendar.types.d.ts).
//
// So the probe reads the library's own event surface. The day a version
// adds colour to an event, this returns true and the control appears
// with no code change; until then the app behaves as though per-event
// colour does not exist, and says nothing about it.
export interface CalendarCapabilities {
  perEventColour: boolean;
}

let capabilities: CalendarCapabilities | null = null;

export function calendarCapabilities(): CalendarCapabilities {
  if (capabilities) return capabilities;
  let perEventColour = false;
  try {
    const proto = (
      Calendar as unknown as { ExpoCalendarEvent?: { prototype?: object } }
    ).ExpoCalendarEvent?.prototype;
    // A colour an event can CARRY shows up as a property on the event
    // class, the same way `alarms` and `title` do.
    perEventColour = proto ? 'color' in proto || 'eventColor' in proto : false;
  } catch {
    perEventColour = false;
  }
  capabilities = { perEventColour };
  return capabilities;
}

// ─── Target resolution ────────────────────────────────────────────────

function defaultCalendarId(): string | null {
  // iOS only; Android exposes no system-wide default calendar. Used to
  // mark the default's source as preferred, so a new KickOffCal calendar
  // lands in the account the user already lives in.
  if (Platform.OS !== 'ios') return null;
  try {
    return Calendar.getDefaultCalendarSync().id;
  } catch {
    return null;
  }
}

// Platform calendars → the pure decision layer's shape. On Android the
// account IS the source (`source.name` = ACCOUNT_NAME, `source.type` =
// ACCOUNT_TYPE, e.g. `com.google`), which is how a Google calendar gets
// classified as cloud despite carrying no iOS SourceType.
function toCalendarLike(
  c: Calendar.ExpoCalendar,
  defaultId: string | null,
): CalendarLike {
  const type = c.source?.type === undefined ? '' : String(c.source.type);
  return {
    id: c.id,
    title: c.title ?? '',
    allowsModifications: c.allowsModifications,
    // iOS reports no isPrimary; the DEFAULT calendar is the equivalent
    // signal, and the decision layer prefers its source when that source
    // is already cloud.
    isPrimary: Platform.OS === 'ios' ? c.id === defaultId : c.isPrimary,
    source: { id: c.source?.id, name: c.source?.name, type },
    ...(Platform.OS === 'android'
      ? { accountName: c.source?.name, accountType: type }
      : {}),
  };
}

function ourCachedId(): string | null {
  const stored = storedTarget();
  if (stored?.kind === 'ours') return stored.calendarId;
  return readJson<string | null>(CAL_KEY, null);
}

// A calendar may only be adopted (and therefore renamed, recoloured or
// deleted) when it is PROVABLY ours. Title alone is not proof once a
// user calendar can be the target — someone's own "KickOffCal" full of
// their appointments must never be hijacked.
//
// `scan` is null when ownership came from the stored record and no scan
// was needed: resolution runs on EVERY sync, and a speculative 8-year
// listEvents over the target on top of the prune pass is pure cost.
interface Ownership {
  scan: CalendarScan | null;
}

async function provablyOurs(
  c: Calendar.ExpoCalendar,
  cachedId: string | null,
): Promise<Ownership | null> {
  if (c.id === cachedId) return { scan: null }; // ours by our own record
  const title = c.title ?? '';
  const legacy = LEGACY_CAL_TITLES.includes(title);
  if (title !== CAL_TITLE && !legacy) return null;
  let scan: CalendarScan;
  try {
    scan = await scanCalendar(c);
  } catch {
    return null; // unreadable → not provably ours; leave it alone
  }
  // Any foreign event means this is somebody's calendar, not ours.
  if (scan.foreign > 0) return null;
  // A legacy title has to carry our events to count: an empty calendar
  // called "Gameday" is more plausibly the user's than ours.
  if (legacy && scan.ours.length === 0) return null;
  return { scan };
}

// If duplicate KickOffCal calendars exist (zombie dev runs, interrupted
// installs), keep the one holding the most tagged events and delete the
// rest — each one provably ours and provably free of foreign events.
async function resolveOurCalendar(
  calendars: readonly Calendar.ExpoCalendar[],
): Promise<Calendar.ExpoCalendar | null> {
  const cachedId = ourCachedId();
  const ours: Array<{ c: Calendar.ExpoCalendar; scan: CalendarScan | null }> =
    [];
  for (const c of calendars) {
    const owned = await provablyOurs(c, cachedId);
    if (owned) ours.push({ c, scan: owned.scan });
  }
  if (ours.length === 0) return null;
  if (ours.length === 1) return ours[0].c;
  // Only a duplicate situation needs the counts, so only it pays for the
  // scans it skipped above.
  const counted = await Promise.all(
    ours.map(async ({ c, scan }) => {
      if (scan) return { c, scan };
      try {
        return { c, scan: await scanCalendar(c) };
      } catch {
        return { c, scan: { ours: [], foreign: 1 } as CalendarScan };
      }
    }),
  );
  // The one we are already writing to wins the tie-break; otherwise the
  // one holding the most events. Keeping the target stable matters more
  // than the count — a switch of keeper would drag every event with it.
  counted.sort(
    (a, b) =>
      Number(b.c.id === cachedId) - Number(a.c.id === cachedId) ||
      b.scan.ours.length - a.scan.ours.length,
  );
  const [keep, ...drop] = counted;
  for (const { c, scan } of drop) {
    // Never bin a calendar holding anything that is not ours, even one
    // that passed the title test — a scan failure lands here as foreign.
    if (scan.foreign > 0) continue;
    try {
      await c.delete();
    } catch {
      // A calendar we cannot delete stays; it is no longer the target,
      // so nothing will be written to it again.
    }
  }
  return keep.c;
}

// Rename + recolour, ours only. Both are cosmetic: never fail a sync.
//
// PROOF BY CALL SITE, stated as the invariant it is (Prompt 26 §4):
// every caller reaches this with a calendar that came out of
// resolveOurCalendar, i.e. one that passed provablyOurs — our record or
// our title PLUS a scan showing zero foreign events. That is a STRONGER
// proof than setCalendarColour's mayRecolour (which cannot afford the
// scan on every swatch tap). A new caller that has not run the proof is
// a bug; there is deliberately no unproven recolour path to reach for.
async function conformOurCalendar(c: Calendar.ExpoCalendar): Promise<void> {
  if ((c.title ?? '') !== CAL_TITLE) {
    try {
      await c.update({ title: CAL_TITLE });
    } catch {
      // keep serving under the old title rather than fail the sync
    }
  }
  const want = calendarColour();
  if ((c.color ?? '').slice(0, 7).toLowerCase() !== want.toLowerCase()) {
    try {
      await c.update({ color: want });
    } catch {
      // keep the platform's colour
    }
  }
}

function targetFrom(cal: CalendarLike, kind: TargetKind): ResolvedTarget {
  return {
    calendarId: cal.id,
    kind,
    label: cal.title,
    accountLabel: accountLabelOf(cal),
    sourceKind: sourceKindOf(cal),
  };
}

function remember(target: ResolvedTarget, chosen: boolean): ResolvedTarget {
  const stored: CalendarTarget = { ...target, chosen };
  saveTarget(stored);
  if (target.kind === 'ours') writeJson(CAL_KEY, target.calendarId);
  return target;
}

async function createOurCalendar(
  sourceId: string | undefined,
): Promise<Calendar.ExpoCalendar> {
  const details: NonNullable<Parameters<typeof Calendar.createCalendar>[0]> = {
    title: CAL_TITLE,
    color: calendarColour(),
    entityType: Calendar.EntityTypes.EVENT,
    name: CAL_TITLE,
  };
  if (Platform.OS === 'ios') {
    // A cloud source when the device has one — that is the whole point
    // of the feature. Falls back to the default calendar's source.
    details.sourceId = sourceId ?? Calendar.getDefaultCalendarSync().source.id;
  } else {
    // Android cannot create inside a `com.google` account; a local
    // calendar is the isolation fallback.
    details.source = { isLocalAccount: true, name: CAL_TITLE, type: 'LOCAL' };
    details.ownerAccount = CAL_TITLE;
    details.accessLevel = Calendar.CalendarAccessLevel.OWNER;
  }
  return Calendar.createCalendar(details);
}

// MINIMUM FRICTION: this runs on every sync and must land on a working
// target without the user ever opening a setting.
export async function ensureCalendarTarget(): Promise<Result<ResolvedTarget>> {
  try {
    const calendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
    // Circuit breaker. An empty list is not "this device has no
    // calendars" — every device has at least one — it is the store
    // failing to answer. Re-resolving on that signal would conclude the
    // target had been deleted and drag every event into a calendar we
    // then created. Better to skip this sync and try again.
    if (calendars.length === 0) {
      return err({ kind: 'unknown', message: 'No calendars available yet.' });
    }
    const defaultId = defaultCalendarId();
    const likes = calendars.map((c) => toCalendarLike(c, defaultId));

    // 1. Our own calendar, resolved first so duplicates are consolidated
    // and a pre-rename "Gameday" is adopted, whatever the target is.
    const existing = await resolveOurCalendar(calendars);

    // 2. The target we are ALREADY writing to wins. Stickiness is not a
    // nicety: every ledgered event lives in that calendar, and re-deriving
    // the target each sync would drag all of them across the moment the
    // inputs shifted — a second Google account appearing, say. The only
    // reasons to re-resolve are that the calendar is gone or has become
    // read-only.
    const stored = storedTarget();
    if (stored) {
      const match = likes.find((c) => c.id === stored.calendarId);
      const stale = stored.kind === 'ours' && existing?.id !== stored.calendarId;
      if (match && isWritable(match) && !stale) {
        if (stored.kind === 'ours' && existing) await conformOurCalendar(existing);
        return ok(
          remember(targetFrom(match, stored.kind), stored.chosen === true),
        );
      }
      // Gone, read-only, or superseded (the duplicate consolidation kept
      // a different calendar of ours). Re-resolve rather than fail every
      // sync forever; the ledger's own repair moves the events across.
      clearTarget();
    }

    // 3. A calendar of ours that already exists always wins — never
    // strand the events already in it.
    if (existing) {
      await conformOurCalendar(existing);
      const like =
        likes.find((c) => c.id === existing.id) ??
        toCalendarLike(existing, defaultId);
      return ok(remember({ ...targetFrom(like, 'ours'), label: CAL_TITLE }, false));
    }

    // 4. Automatic default, per platform (docs/CALENDAR_TARGET.md).
    const pick = chooseDefaultTarget(
      likes,
      [CAL_TITLE, ...LEGACY_CAL_TITLES],
      Platform.OS === 'ios' ? 'ios' : 'android',
    );
    if (pick.calendarId) {
      // Android: write into their Google calendar. We create nothing,
      // rename nothing, recolour nothing.
      const cal = likes.find((c) => c.id === pick.calendarId);
      if (cal) return ok(remember(targetFrom(cal, 'user'), false));
    }
    const created = await createOurCalendar(pick.createInSourceId);
    const like = toCalendarLike(created, defaultId);
    return ok(remember({ ...targetFrom(like, 'ours'), label: CAL_TITLE }, false));
  } catch (e) {
    return err({ kind: 'unknown', message: `calendar target failed: ${e}` });
  }
}

// ─── The picker ───────────────────────────────────────────────────────

export type TargetRequest =
  | { kind: 'existing'; calendarId: string }
  | { kind: 'create'; sourceId?: string };

export interface TargetOptions {
  calendars: CalendarLike[];
  sources: CreatableSource[]; // iOS only — Android cannot create in an account
  ourCalendarId: string | null;
  ourSourceId: string | null; // so the picker never offers a second one there
}

export async function listTargetOptions(): Promise<Result<TargetOptions>> {
  try {
    const calendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
    const defaultId = defaultCalendarId();
    const likes = calendars.map((c) => toCalendarLike(c, defaultId));
    const existing = await resolveOurCalendar(calendars);
    const ourLike = existing
      ? likes.find((c) => c.id === existing.id) ?? null
      : null;
    return ok({
      calendars: likes.filter(isWritable),
      sources: Platform.OS === 'ios' ? creatableSources(likes) : [],
      ourCalendarId: ourLike?.id ?? null,
      ourSourceId: ourLike?.source?.id ?? null,
    });
  } catch (e) {
    return err({ kind: 'unknown', message: `calendar list failed: ${e}` });
  }
}

// Records an explicit choice and returns the resolved target. Creating
// happens here; MOVING the existing events is the engine's job
// (switchCalendarTarget) because it owns the ledger.
export async function applyTargetRequest(
  req: TargetRequest,
): Promise<Result<ResolvedTarget>> {
  try {
    const calendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
    const defaultId = defaultCalendarId();
    if (req.kind === 'create') {
      // Never make a second one: a calendar of ours already in the
      // requested source IS the answer to "create one there".
      const existing = await resolveOurCalendar(calendars);
      const reusable =
        existing &&
        (req.sourceId === undefined || existing.source?.id === req.sourceId)
          ? existing
          : null;
      const cal = reusable ?? (await createOurCalendar(req.sourceId));
      if (reusable) await conformOurCalendar(cal);
      const like = toCalendarLike(cal, defaultId);
      return ok(
        remember({ ...targetFrom(like, 'ours'), label: CAL_TITLE }, true),
      );
    }
    const obj = calendars.find((c) => c.id === req.calendarId);
    if (!obj) return err({ kind: 'not-found', what: 'that calendar' });
    const like = toCalendarLike(obj, defaultId);
    if (!isWritable(like)) {
      return err({ kind: 'unknown', message: 'That calendar is read-only.' });
    }
    // Picking our own calendar back keeps its 'ours' powers; anything
    // else is the user's and is treated as untouchable.
    const kind: TargetKind =
      (await provablyOurs(obj, ourCachedId())) !== null ? 'ours' : 'user';
    if (kind === 'ours') await conformOurCalendar(obj);
    return ok(remember(targetFrom(like, kind), true));
  } catch (e) {
    return err({ kind: 'unknown', message: `calendar switch failed: ${e}` });
  }
}

// After a switch: bin the calendar we left behind, but ONLY when it is
// ours and nothing remains in it. Never a user's calendar, never one
// still holding events.
export async function deleteVacatedCalendarIfOurs(
  calendarId: string,
): Promise<boolean> {
  try {
    const cal = await Calendar.ExpoCalendar.get(calendarId);
    if ((await provablyOurs(cal, ourCachedId())) === null) return false;
    // Emptiness is checked for real here, never inferred: a calendar
    // still holding events — ours or anyone's — is not disposable.
    const scan = await scanCalendar(cal);
    if (scan.ours.length > 0 || scan.foreign > 0) return false;
    await cal.delete();
    if (readJson<string | null>(CAL_KEY, null) === calendarId) {
      removeKey(CAL_KEY);
    }
    return true;
  } catch {
    return false;
  }
}

// ─── Events ───────────────────────────────────────────────────────────

export interface EventInput {
  fixtureId: string;
  title: string;
  startUtc: string;
  endUtc: string;
  allDay: boolean;
  reminderMinutesBefore: number | null;
  // Day-shaped reminder for ALL-DAY entries (Prompt 24 A1) — the civil
  // choice, translated to a platform offset below at write time.
  allDayReminder?: AllDayReminder;
  // Per-event colour, where the layer supports one. Never set on a
  // platform whose probe says no — the UI cannot offer it there, so the
  // planner never has one to want, and the write below never sends it.
  colour?: string;
  note?: string;
}

function toEventDetails(input: EventInput) {
  // The planner's all-day span is EXCLUSIVE next-midnight (Android's
  // CalendarContract convention). EventKit treats the end date's DAY as
  // INCLUSIVE — passing next-midnight made every one-day placeholder
  // render as a two-day banner on iOS (verified in the sim's calendar
  // store: 00:00 → next day 23:59:59). On iOS the end must land inside
  // the LAST day of the span (exclusive end − 24h, plus an hour so it is
  // unambiguously within the day); EventKit snaps it to end-of-day
  // itself. For a one-day span this is the same start+1h it always was;
  // multi-day date_only spans (Prompt 5: tournaments, meetings, the
  // provisional appearance window) keep their full width on both
  // platforms.
  // Clamped to start+1h: a recovered ledger entry can carry a
  // degenerate endUtc (recovery reads all-day ends back in platform
  // conventions), and end-before-start must never reach a native write.
  const allDayEnd =
    Platform.OS === 'ios'
      ? new Date(
          Math.max(
            new Date(input.endUtc).getTime() - 86_400_000 + 3_600_000,
            new Date(input.startUtc).getTime() + 3_600_000,
          ),
        )
      : new Date(input.endUtc);
  return {
    title: input.title,
    startDate: new Date(input.startUtc),
    endDate: input.allDay ? allDayEnd : new Date(input.endUtc),
    allDay: input.allDay,
    // All-day placeholders are built from a UTC day boundary
    // (dayStartUtc). Without pinning the zone, the platform reads those
    // date components in DEVICE-LOCAL time, so a user west of UTC sees
    // the placeholder a day EARLY (2026-08-23T00:00Z is Aug 22, 17:00
    // in Los Angeles). Timed events must NOT be pinned — they are true
    // instants and have to render in the viewer's own zone.
    ...(input.allDay ? { timeZone: 'UTC' } : {}),
    // The tag MUST stay on the first line and start the string:
    // fixtureIdFromNotes anchors on it and reads to the first newline, and
    // it is the only thing standing between a sync bug and somebody's real
    // appointments. Anything we want to say to the user goes below it.
    notes: input.note
      ? `${NOTES_TAG}${input.fixtureId}\n\n${input.note}`
      : `${NOTES_TAG}${input.fixtureId}`,
    alarms: (() => {
      // One channel per entry kind: timed events carry minutes-before,
      // all-day entries carry the day-shaped choice. The translation to
      // an offset happens HERE because the anchor is a platform fact:
      // Android's provider stores an all-day DTSTART at UTC midnight
      // (and we pin timeZone: 'UTC' above); EventKit treats all-day
      // events as floating, day boundaries local — 'local-midnight'
      // there. The iOS half is doctrine, not yet hardware-verified
      // (M6: no iOS device); Android is verified by today's install.
      const minutes = input.allDay
        ? allDayAlarmMinutesBefore(
            input.startUtc,
            input.allDayReminder ?? null,
            Platform.OS === 'ios' ? 'local-midnight' : 'utc-midnight',
          )
        : input.reminderMinutesBefore;
      return minutes === null ? [] : [{ relativeOffset: -minutes }];
    })(),
    ...(input.colour && calendarCapabilities().perEventColour
      ? { color: input.colour }
      : {}),
  };
}

// One shared calendar object per sync run — instantiating a native
// shared object per event exhausts bridge handles and hangs mid-run.
export async function getCalendarObject(
  calendarId: string,
): Promise<Result<Calendar.ExpoCalendar>> {
  try {
    return ok(await Calendar.ExpoCalendar.get(calendarId));
  } catch (e) {
    return err({ kind: 'unknown', message: `calendar get failed: ${e}` });
  }
}

export async function createFixtureEvent(
  calendar: Calendar.ExpoCalendar,
  input: EventInput,
): Promise<Result<string>> {
  try {
    const event = await calendar.createEvent(toEventDetails(input));
    return ok(event.id);
  } catch (e) {
    return err({ kind: 'unknown', message: `event create failed: ${e}` });
  }
}

export async function updateFixtureEvent(
  eventId: string,
  input: EventInput,
): Promise<Result<string>> {
  try {
    const event = await Calendar.ExpoCalendarEvent.get(eventId);
    // Same null contract as delete, one wedge over: a user hand-deletes
    // an event, its fixture later changes, the planner emits an update,
    // and `null.update(...)` would abort every sync from then on. A
    // typed 'not-found' lets the engine recreate instead — the fixture
    // is still wanted; only its event vanished.
    if (event === null || event === undefined) {
      return err({ kind: 'not-found', what: 'event' });
    }
    await event.update(toEventDetails(input));
    return ok(eventId);
  } catch (e) {
    if (isEventGoneError(String(e))) {
      return err({ kind: 'not-found', what: 'event' });
    }
    return err({ kind: 'unknown', message: `event update failed: ${e}` });
  }
}

export async function deleteFixtureEvent(eventId: string): Promise<Result<true>> {
  try {
    // THE NEXT-API CONTRACT, corrected twice and finally taken from the
    // device: the Kotlin layer returns null for a missing event
    // (findById `?: return null`), but expo's JS wrapper rehydrates
    // results into SharedObjects and THROWS
    // "TypeError: setPrototypeOf argument is not coercible to Object"
    // on that null — so callers see an exception, not a null. The catch
    // below classifies it via isEventGoneError. The null check stays
    // for any expo version that fixes the wrapper to pass null through.
    const event = await Calendar.ExpoCalendarEvent.get(eventId);
    if (event === null || event === undefined) return ok(true);
    // Last line of defence before an irreversible act. Callers only ever
    // pass ids that came from the ledger or from ourEventsIn(), so
    // reaching this branch with somebody else's event would mean a bug —
    // and that bug must not cost a user their appointment.
    // Deliberately asymmetric: notes we can READ and that lack our tag
    // prove the event is not ours and the delete is refused; absent
    // notes prove nothing, and refusing there would brick syncing on any
    // platform that stops reporting them.
    if (typeof event.notes === 'string' && event.notes.length > 0) {
      if (fixtureIdFromNotes(event.notes) === null) {
        return err({ kind: 'unknown', message: 'refused: not our event' });
      }
    }
    await event.delete();
    return ok(true);
  } catch (e) {
    // Only a true not-found is success (user deleted it by hand). Any
    // other failure must abort the sync BEFORE the ledger entry is
    // dropped — swallowing real errors once orphaned events into
    // duplicates (see DECISIONS.md).
    if (isEventGoneError(String(e))) {
      return ok(true);
    }
    return err({ kind: 'unknown', message: `event delete failed: ${e}` });
  }
}
