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
  cardAppearances,
  cardToFixture,
  extractLdJson,
} from '../providers/pbc';

const html = readFileSync(join(__dirname, 'fixtures', 'pbc-sample.html'), 'utf8');
const URL = 'https://www.premierboxingchampions.com/fight-night-august-22-2026';
const AT = '2026-08-02T00:00:00.000Z';

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

test('the card fixture is the main event, unchanged by Prompt 5', () => {
  const f = cardToFixture(URL, html, AT)!;
  expect(f.id).toBe('pbc-fight-night-august-22-2026');
  expect(f.title).toBe('Rolando Romero vs Teofimo Lopez');
  // 2026-08-22T17:00:00-05:00, as published.
  expect(f.startUtc).toBe('2026-08-22T22:00:00.000Z');
  expect(f.followKeys).toEqual(['pbc-cards']);
  expect(f.timePrecision).toBe('nominal');
  expect(f.confidence).toBe('provisional');
});

test('every bout becomes an appearance, named from performer givenName+familyName', () => {
  const card = cardToFixture(URL, html, AT)!;
  const apps = cardAppearances(card, html, AT);
  expect(apps).toHaveLength(4);
  // The third bout's NODE name says "Antonio Russell"; the performer
  // record says "Gary Antonio Russell". The Person record wins — the
  // node name abbreviates.
  expect(apps.map((a) => a.title)).toEqual([
    'Rolando Romero vs Teofimo Lopez',
    'Yoenli Hernandez vs Francisco Daniel Veron',
    'Victor Santillan vs Gary Antonio Russell',
    'Carlos Utria vs Israel Mercado',
  ]);
  // Nicknames — including the empty "" for fighters without one — never
  // leak into names or keys.
  expect(apps.flatMap((a) => a.athletes ?? [])).not.toContainEqual(
    expect.stringContaining('"'),
  );
  for (const a of apps) {
    expect(a.parentFixtureId).toBe('pbc-fight-night-august-22-2026');
    expect(a.startUtc).toBe(card.startUtc); // provisional = parent window
    expect(a.durationHours).toBe(4);
    expect(a.confidence).toBe('provisional');
    expect(a.followKeys[0]).toBe('pbc-cards-appearances');
  }
  // The prelim fighter the whole stage exists for: followable from the
  // undercard, not just the marquee.
  expect(apps[3].followKeys).toContain('athlete-israel-mercado');
});
