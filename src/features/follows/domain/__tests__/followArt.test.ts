// Keeping follows' artwork current (Prompt 16 C). The stored snapshot
// was one-way and permanent: a follow made before crests existed showed
// a monogram for ever, and re-following from a screen with no crest to
// pass destroyed the one it had.

import { applyArtHydration } from '../followArt';

interface Follow {
  key: string;
  label: string;
  crestUrl?: string;
  brandColour?: string;
}

const follows: Follow[] = [
  { key: 'tsdb-team-134886', label: 'Minnesota Timberwolves' },
  { key: 'fdorg-team-57', label: 'Arsenal', crestUrl: 'old.png', brandColour: '#C81E1E' },
  { key: 'athlete_000003', label: 'Rolando Romero' },
];

it('fills in a crest a follow never captured', () => {
  const { next, changed } = applyArtHydration(follows, [
    { key: 'tsdb-team-134886', crestUrl: 'wolves.png' },
  ]);
  expect(changed).toBe(true);
  expect(next[0].crestUrl).toBe('wolves.png');
  // Everything it did not name is untouched.
  expect(next[1].crestUrl).toBe('old.png');
  expect(next[2].crestUrl).toBeUndefined();
});

it('refreshes a crest whose URL has moved', () => {
  const { next, changed } = applyArtHydration(follows, [
    { key: 'fdorg-team-57', crestUrl: 'new.png' },
  ]);
  expect(changed).toBe(true);
  expect(next[1].crestUrl).toBe('new.png');
});

it('lets a takedown reach stored follows', () => {
  // `imagery: false` removes a logo from the served rows with no
  // deploy. If hydration only ever added artwork, the suppressed crest
  // would live on in the follow store indefinitely.
  const { next, changed } = applyArtHydration(follows, [
    { key: 'fdorg-team-57' },
    { key: 'tsdb-team-134886', crestUrl: 'wolves.png' },
  ]);
  expect(changed).toBe(true);
  expect(next[1].crestUrl).toBeUndefined();
});

it('does NOT read a crest-less response as a takedown', () => {
  // An endpoint that carries no artwork at all says nothing about any
  // entity — treating that silence as "no crest" is the read-failure-
  // as-empty mistake in another costume.
  const { next, changed } = applyArtHydration(follows, [
    { key: 'fdorg-team-57' },
  ]);
  expect(changed).toBe(false);
  expect(next[1].crestUrl).toBe('old.png');
});

it('adds a colour but never flattens a richer one', () => {
  const { next } = applyArtHydration(follows, [
    { key: 'tsdb-team-134886', brandColour: '#0C2340' },
    { key: 'fdorg-team-57', brandColour: '#000000', crestUrl: 'old.png' },
  ]);
  expect(next[0].brandColour).toBe('#0C2340');
  expect(next[1].brandColour).toBe('#C81E1E');
});

it('reports no change when there is nothing to do', () => {
  const { changed } = applyArtHydration(follows, [
    { key: 'someone-else', crestUrl: 'x.png' },
  ]);
  expect(changed).toBe(false);
});
