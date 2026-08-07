// The one slug constructor, and the case four sites disagreed about.
//
// Normalise-then-hyphenate was written independently in four places.
// `tournamentKey` and `groupKey` returned null for a name that normalises
// to nothing — both after being burned. `promoterKey` and `appearanceId`
// checked EMPTINESS instead, which is a different test and lets a
// punctuation-only name through to mint a shared key.

import { nameSlug } from '../identity';
import { appearanceId } from '../appearances';
import { promoterKey } from '../reviewQueue';
import { tournamentKey } from '../tennisTournaments';
import { groupKey } from '../providers/worldAthletics';

describe('nameSlug', () => {
  it('hyphenates a normalised name', () => {
    expect(nameSlug('National Bank Open')).toBe('national-bank-open');
    expect(nameSlug('Borussia Mönchengladbach')).toBe('borussia-monchengladbach');
  });

  it('collapses runs of punctuation rather than leaving empty segments', () => {
    expect(nameSlug('A  --  B')).toBe('a-b');
    expect(nameSlug("O'Brien   Smith")).toBe('o-brien-smith');
  });

  // THE CASE THE FOUR SITES DISAGREED ABOUT.
  it('is null for a name that normalises to nothing', () => {
    for (const raw of ['', '   ', '???', '---', '...', '!!!', '—']) {
      expect(nameSlug(raw)).toBeNull();
    }
  });

  it('is null for null and undefined', () => {
    expect(nameSlug(null)).toBeNull();
    expect(nameSlug(undefined)).toBeNull();
  });

  it('a non-empty string is NOT the same test as a sluggable one', () => {
    // Exactly the gap: this passes "required, non-empty, trimmed" and
    // still has no slug.
    const raw = '???';
    expect(raw.trim().length).toBeGreaterThan(0);
    expect(nameSlug(raw)).toBeNull();
  });
});

describe('the four key constructors agree on the degenerate case', () => {
  it('tournamentKey returns null rather than the bare tennis-t- key', () => {
    expect(tournamentKey('???')).toBeNull();
    expect(tournamentKey('Wimbledon')).toBe('tennis-t-wimbledon');
  });

  it('groupKey returns null rather than the bare wa- key', () => {
    expect(groupKey('???')).toBeNull();
    expect(groupKey(null)).toBeNull();
    expect(groupKey('Diamond League')).toBe('wa-diamond-league');
  });

  // Previously minted `review-`, which every such item would have shared.
  it('promoterKey returns null rather than the bare review- key', () => {
    expect(promoterKey('???')).toBeNull();
    expect(promoterKey('Queensberry')).toBe('review-queensberry');
  });

  // Previously minted `<parent>-app-`, colliding two bouts onto one id —
  // and this id keys the sync ledger, so a collision overwrites somebody
  // else's calendar event rather than merely duplicating it.
  it('appearanceId returns null rather than a truncated id', () => {
    expect(appearanceId('parent-1', ['???', 'Alcaraz'])).toBeNull();
    expect(appearanceId('parent-1', ['Sinner', 'Alcaraz'])).toBe(
      'parent-1-app-sinner-alcaraz',
    );
  });

  it('two different bouts under one parent no longer share an id', () => {
    const a = appearanceId('parent-1', ['???', 'Alcaraz']);
    const b = appearanceId('parent-1', ['!!!', 'Sinner']);
    // Both refuse rather than both returning `parent-1-app--alcaraz`-style
    // ids that could coincide.
    expect(a).toBeNull();
    expect(b).toBeNull();
  });
});
