// Keeping a follow's identity artwork current. PURE.
//
// A Followable's crest is captured at FOLLOW TIME and never touched
// again — `setFollowed` writes the caller's object whole. That made the
// stored snapshot permanent and one-way: every follow made before crests
// were reinstated (Prompt 13) shows a monogram for ever, no matter how
// many times the app syncs, while the directory would hand the crest
// over instantly; and an unfollow→re-follow from a screen that has no
// crest to pass silently DESTROYED one.
//
// So whenever a screen fetches directory rows — browse, search — it
// hands them here and any stored follow they name is brought up to date.
//
// TAKEDOWNS MUST STILL PROPAGATE. `imagery: false` on a catalogue
// document removes a competition's logo from the served rows within the
// serve cache and with no deploy; if hydration only ever ADDED artwork,
// a suppressed crest would live on in the follow store indefinitely. So
// an absent crest CLEARS the stored one — but only when the response
// proves it carries crests at all (at least one row has one), because
// otherwise "this endpoint does not send crests" and "this entity has
// no crest" are the same shape, and that is the read-failure-as-empty
// mistake in another costume.

export interface ArtRow {
  key: string;
  crestUrl?: string;
  brandColour?: string;
  countryCode?: string;
}

export interface ArtCarrier {
  key: string;
  crestUrl?: string;
  brandColour?: string;
  countryCode?: string;
}

export function applyArtHydration<T extends ArtCarrier>(
  follows: readonly T[],
  rows: readonly ArtRow[],
): { next: T[]; changed: boolean } {
  const byKey = new Map(rows.map((r) => [r.key, r]));
  // Does this response carry artwork at all? If not, an absence in it
  // says nothing about the entity.
  const carriesCrests = rows.some((r) => r.crestUrl);
  let changed = false;
  const next = follows.map((f) => {
    const row = byKey.get(f.key);
    if (!row) return f;
    const updated: T = { ...f };
    if (row.crestUrl) {
      if (f.crestUrl !== row.crestUrl) {
        updated.crestUrl = row.crestUrl;
        changed = true;
      }
    } else if (carriesCrests && f.crestUrl !== undefined) {
      delete updated.crestUrl;
      changed = true;
    }
    // Colour is additive only: it is derived from free-text kit colours
    // on some routes and absent on others, and a follow themed from a
    // richer source must not be flattened by a poorer one.
    if (row.brandColour && !f.brandColour) {
      updated.brandColour = row.brandColour;
      changed = true;
    }
    // NATIONALITY IS ADDITIVE, NEVER CLEARED. It is a fact about a
    // person, not artwork we license — there is no takedown to
    // propagate, and a search result that happens not to carry one says
    // nothing about the athlete. This is what gives athletes followed
    // before Prompt 17 their flag on the next browse.
    if (row.countryCode && f.countryCode !== row.countryCode) {
      updated.countryCode = row.countryCode;
      changed = true;
    }
    return updated;
  });
  return { next, changed };
}
