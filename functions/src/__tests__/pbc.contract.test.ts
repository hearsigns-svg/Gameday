// PBC contract test — pinned to a REAL card page captured 2026-08-02
// from premierboxingchampions.com/fight-night-august-22-2026 (reduced to
// its three ld+json blocks verbatim; see fixtures/pbc-sample.html).
//
// The page's third JSON-LD block is an ARRAY of four SportsEvent nodes —
// one per bout, main event first, all sharing the card's start time.
// Expectations here are LITERAL values read off the banked payload, per
// the house contract-test norm: deriving them through the code under
// test would be a tautology.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  candidateOrder,
  cardAppearances,
  cardToFixture,
  extractLdJson,
} from '../providers/pbc';

const html = readFileSync(join(__dirname, 'fixtures', 'pbc-sample.html'), 'utf8');
const URL = 'https://www.premierboxingchampions.com/fight-night-august-22-2026';
const AT = '2026-08-02T00:00:00.000Z';

test('REGRESSION: undated slugs can never starve a dated upcoming card under the cap', () => {
  // Live 2026-08-02: nineteen undated URLs sat ahead of the one dated
  // upcoming card in sitemap order, so slice(0, 12) fetched twelve past
  // cards and the August 22 card never entered the cache.
  const base = 'https://www.premierboxingchampions.com';
  const urls = [
    ...Array.from({ length: 19 }, (_, i) => `${base}/some-named-card-${i}`),
    `${base}/fight-night-august-22-2026`,
    `${base}/fight-night-july-12-2026`, // dated but before the window
    `${base}/fight-night-september-05-2026`,
  ];
  const ordered = candidateOrder(urls, '2026-07-26');
  // Dated upcoming first, soonest first; undated after; pre-window
  // dated cards excluded entirely.
  expect(ordered[0]).toBe(`${base}/fight-night-august-22-2026`);
  expect(ordered[1]).toBe(`${base}/fight-night-september-05-2026`);
  expect(ordered).toHaveLength(21);
  expect(ordered.slice(0, 12)).toContain(`${base}/fight-night-august-22-2026`);
  expect(ordered).not.toContain(`${base}/fight-night-july-12-2026`);
});

test('the page carries one SportsEvent node per bout, main event first', () => {
  const events = extractLdJson(html).filter((e) => e['@type'] === 'SportsEvent');
  expect(events.map((e) => e.name)).toEqual([
    'Rolando Romero vs Teofimo Lopez',
    'Yoenli Hernandez vs Francisco Daniel Veron',
    'Victor Santillan vs Antonio Russell',
    'Carlos Utria vs Israel Mercado',
  ]);
  // Every bout shares the card's start — the reason bout slots stay
  // provisional: there is no per-bout time to confirm from this source.
  expect(new Set(events.map((e) => e.startDate)).size).toBe(1);
});

test('the card fixture is the main event, with the provider\'s own window', () => {
  const f = cardToFixture(URL, html, AT)!;
  expect(f.id).toBe('pbc-fight-night-august-22-2026');
  expect(f.title).toBe('Rolando Romero vs Teofimo Lopez');
  // 2026-08-22T17:00:00-05:00, as published.
  expect(f.startUtc).toBe('2026-08-22T22:00:00.000Z');
  // The published endDate is 19:00-05:00 — a 2h card window, the
  // provider's word rather than the old per-league 4h constant.
  expect(f.durationHours).toBe(2);
  expect(f.followKeys).toEqual(['pbc-cards']);
  expect(f.timePrecision).toBe('nominal');
  expect(f.confidence).toBe('provisional');
});

test('every bout becomes an appearance draft, named from performer givenName+familyName', () => {
  const card = cardToFixture(URL, html, AT)!;
  const drafts = cardAppearances(card, html, AT);
  expect(drafts).toHaveLength(4);
  // The third bout's NODE name says "Antonio Russell"; the performer
  // record says "Gary Antonio Russell". The Person record wins — the
  // node name abbreviates.
  expect(drafts.map((d) => d.fixture.title)).toEqual([
    'Rolando Romero vs Teofimo Lopez',
    'Yoenli Hernandez vs Francisco Daniel Veron',
    'Victor Santillan vs Gary Antonio Russell',
    'Carlos Utria vs Israel Mercado',
  ]);
  // Nicknames — including the empty "" for fighters without one — never
  // leak into names or refs.
  expect(drafts.flatMap((d) => d.fixture.athletes ?? [])).not.toContainEqual(
    expect.stringContaining('"'),
  );
  for (const [i, d] of drafts.entries()) {
    expect(d.fixture.parentFixtureId).toBe('pbc-fight-night-august-22-2026');
    expect(d.fixture.startUtc).toBe(card.startUtc); // provisional = parent window
    expect(d.fixture.durationHours).toBe(2); // the card's published window
    expect(d.fixture.confidence).toBe('provisional');
    // The MAIN EVENT heads the node list — the same ordering the card
    // TITLE already trusts (cardToFixture takes events[0].name, and
    // this capture's headline is Romero–Lopez). Only that bout carries
    // the main-event scoped key (Prompt 11); undercard bouts must not.
    expect(d.fixture.followKeys).toEqual(
      i === 0
        ? ['pbc-cards-appearances', 'pbc-cards-main']
        : ['pbc-cards-appearances'],
    );
    // PBC publishes no fighter ids: refs are name-only, and canonical
    // resolution (athletes.ts, policy 'structured') decides the keys.
    expect(d.refs.every((r) => r.externalId === undefined)).toBe(true);
  }
  // The banked truth the -main stamp rests on: node 0 IS the card's
  // headline pair. If PBC ever reorders its JSON-LD, this fails before
  // a follower gets an undercard bout labelled as the main event.
  expect(drafts[0].fixture.title).toBe('Rolando Romero vs Teofimo Lopez');
  expect(cardToFixture(URL, html, AT)!.title).toBe(
    'Rolando Romero vs Teofimo Lopez',
  );
  // The prelim fighter the whole stage exists for: followable from the
  // undercard, not just the marquee.
  expect(drafts[3].refs.map((r) => r.name)).toContain('Israel Mercado');
});
