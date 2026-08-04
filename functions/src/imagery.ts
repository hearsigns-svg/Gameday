// Imagery policy — PURE. Who is allowed a picture, and who can be
// switched off in a hurry.
//
// Prompt 13 reverses the 9b removal: club crests and competition logos
// are restored with the trademark risk ACCEPTED. Accepting a risk only
// means something if you can respond to a complaint faster than a
// deploy, so the ops surface is the same one that already cools a
// poller — a field on the catalogue document, editable in the console.
//
// THREE CATEGORIES, THREE DIFFERENT CALLS (owner ruling 2026-08-04):
//   1. Club crests and competition logos — RESTORED. Trademark;
//      enforcement is discretionary and complaint-driven, and the
//      takedown switch below is the response.
//   2. Athlete photography — Wikimedia Commons ONLY, keeping the
//      verified-at-fetch gate (allowed licence AND named artist). WTA,
//      World Athletics and PBC photography stays UNWIRED: those are
//      agency images, that is copyright rather than trademark, and
//      agencies pursue it commercially as a matter of course. A
//      different bet, deliberately not taken.
//   3. OLYMPIC MARKS — EXCLUDED ENTIRELY, and not by the same switch.

// Keys whose imagery is refused in CODE, and which no catalogue edit
// can turn back on. The rings, the Games emblems and torch iconography
// are protected in the UK by the Olympic Symbol etc. (Protection) Act
// 1995 and by dedicated statute elsewhere — not by ordinary trademark
// law — and the IOC enforces against non-commercial use. Part A's
// "risk accepted" reasoning does not reach a special statutory regime,
// so this is a hard exclusion rather than an ops toggle: an operator
// flipping `imagery: true` on an Olympic row must not be able to pull
// a Games emblem into the app by accident.
//
// Prefix-matched, because every Olympic discipline key descends from
// the Games key it belongs to.
export const IMAGERY_NEVER_PREFIXES: readonly string[] = [
  'olympics',
  'paralympics',
];

export function imageryPermanentlyExcluded(key: string | undefined): boolean {
  if (!key) return false;
  return IMAGERY_NEVER_PREFIXES.some(
    (p) => key === p || key.startsWith(`${p}-`) || key.startsWith(`${p}:`),
  );
}

// The full test: a hard exclusion, or an ops switch turned off.
// `imageryOff` is the set of competition keys whose catalogue document
// carries `imagery: false` — see the takedown procedure in DECISIONS.
export function imageryAllowed(
  key: string | undefined,
  imageryOff: ReadonlySet<string>,
): boolean {
  if (imageryPermanentlyExcluded(key)) return false;
  return key === undefined || !imageryOff.has(key);
}

// Strip artwork from a row the policy refuses, leaving every other
// field alone. Returning a NEW object rather than mutating: these rows
// come out of a shared 60s cache, and mutating one would poison it for
// every later request in the instance.
export function withImageryPolicy<T extends { crestUrl?: string }>(
  row: T,
  key: string | undefined,
  imageryOff: ReadonlySet<string>,
): T {
  if (imageryAllowed(key, imageryOff)) return row;
  if (row.crestUrl === undefined) return row;
  const { crestUrl: _dropped, ...rest } = row;
  return rest as T;
}
