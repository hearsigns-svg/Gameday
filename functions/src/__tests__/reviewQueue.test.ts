// The review queue's validator is the whole safety story: everything it
// accepts is destined for somebody's calendar, and the extractor upstream
// is an LLM reading a promoter's page. So it rejects rather than repairs —
// a repaired record is a record nobody verified.

import {
  promoterKey,
  reviewItemToAppearances,
  reviewItemToFixture,
  ReviewItem,
  validateSubmission,
} from '../reviewQueue';

const good = {
  sourceUrl: 'https://www.matchroomboxing.com/events/lara-vs-ornelas/',
  promoter: 'Matchroom Boxing',
  title: 'Lara vs Ornelas',
  startUtc: '2026-09-12T19:00:00.000Z',
  venue: 'OVO Arena Wembley',
  broadcaster: 'DAZN',
  bouts: [
    { first: 'Mauricio Lara', second: 'Jose Ornelas', cardPosition: 'main', titleOnTheLine: 'WBA Featherweight' },
    { first: 'Someone Else', second: 'Another Person', cardPosition: 'undercard' },
  ],
};

describe('what it accepts', () => {
  test('a complete submission', () => {
    const r = validateSubmission(good);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.bouts).toHaveLength(2);
    expect(r.value.startUtc).toBe('2026-09-12T19:00:00.000Z');
    expect(r.value.broadcaster).toBe('DAZN');
  });

  test('optional fields may be absent', () => {
    const { venue, broadcaster, ...rest } = good;
    const r = validateSubmission(rest);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.venue).toBeUndefined();
  });
});

describe('what it refuses', () => {
  test('NO SOURCE URL — the non-negotiable one', () => {
    // Every record has to be checkable against where it came from.
    const { sourceUrl, ...rest } = good;
    const r = validateSubmission(rest);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.join(' ')).toContain('sourceUrl');
  });

  test('a source that is not a URL', () => {
    const r = validateSubmission({ ...good, sourceUrl: 'matchroom, I think' });
    expect(r.ok).toBe(false);
  });

  test('an unparseable date', () => {
    const r = validateSubmission({ ...good, startUtc: 'September-ish' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.join(' ')).toContain('startUtc');
  });

  test('no bouts at all', () => {
    expect(validateSubmission({ ...good, bouts: [] }).ok).toBe(false);
  });

  test('a bout with no main event', () => {
    const r = validateSubmission({
      ...good,
      bouts: [{ first: 'A B', second: 'C D', cardPosition: 'undercard' }],
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.join(' ')).toContain('main event');
  });

  test('an invented card position', () => {
    const r = validateSubmission({
      ...good,
      bouts: [{ first: 'A B', second: 'C D', cardPosition: 'headline' }],
    });
    expect(r.ok).toBe(false);
  });

  test('the same fighter on both sides', () => {
    // A classic extraction artefact.
    const r = validateSubmission({
      ...good,
      bouts: [{ first: 'Mauricio Lara', second: 'mauricio lara', cardPosition: 'main' }],
    });
    expect(r.ok).toBe(false);
  });

  test('it reports EVERY problem, not just the first', () => {
    const r = validateSubmission({ bouts: [] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.length).toBeGreaterThan(3);
  });
});

describe('nothing unapproved reaches a calendar', () => {
  const item = (status: ReviewItem['status']): ReviewItem => {
    const parsed = validateSubmission(good);
    if (!parsed.ok) throw new Error('fixture submission must validate');
    return {
      ...parsed.value,
      id: 'abc123',
      status,
      submittedAt: '2026-08-01T00:00:00.000Z',
    };
  };

  test('a provisional item produces no fixture', () => {
    expect(reviewItemToFixture(item('provisional'), 'now')).toBeNull();
  });

  test('a cancelled item produces no fixture', () => {
    expect(reviewItemToFixture(item('cancelled'), 'now')).toBeNull();
  });

  test('a confirmed item becomes a card fixture with its main event', () => {
    const f = reviewItemToFixture(item('confirmed'), '2026-08-02T00:00:00.000Z');
    expect(f).not.toBeNull();
    expect(f!.id).toBe('review-abc123');
    expect(f!.sport).toBe('boxing');
    expect(f!.title).toBe('Lara vs Ornelas');
    expect(f!.homeTeam).toBe('Mauricio Lara');
    expect(f!.awayTeam).toBe('Jose Ornelas');
    expect(f!.followKeys).toEqual(['review-matchroom-boxing']);
    // A hand-verified card start is still a card start, not a ringwalk.
    expect(f!.timePrecision).toBe('nominal');
    expect(f!.confidence).toBe('provisional');
  });

  test('promoter keys are stable across spellings', () => {
    expect(promoterKey('Matchroom Boxing')).toBe(promoterKey('matchroom  boxing'));
  });

  test('every approved bout — undercard included — becomes an appearance draft', () => {
    const drafts = reviewItemToAppearances(
      item('confirmed'),
      '2026-08-02T00:00:00.000Z',
    );
    expect(drafts).toHaveLength(2);
    expect(drafts.map((d) => d.fixture.title)).toEqual([
      'Mauricio Lara vs Jose Ornelas',
      'Someone Else vs Another Person',
    ]);
    for (const d of drafts) {
      expect(d.fixture.parentFixtureId).toBe('review-abc123');
      expect(d.fixture.id.split('-')[0]).toBe('review'); // source attribution holds
      expect(d.fixture.startUtc).toBe('2026-09-12T19:00:00.000Z'); // parent window
      expect(d.fixture.confidence).toBe('provisional');
      expect(d.fixture.followKeys).toEqual([
        'review-matchroom-boxing-appearances',
      ]);
    }
    // The undercard fighter reaches resolution as a ref — operator-
    // verified names may create directory athletes (policy 'structured'
    // at the decideReview call site), which is what keeps a prelim
    // fighter followable.
    expect(drafts[1].refs.map((r) => r.name)).toContain('Another Person');
  });

  test('unapproved bouts produce no appearances', () => {
    expect(reviewItemToAppearances(item('provisional'), 'now')).toHaveLength(0);
    expect(reviewItemToAppearances(item('cancelled'), 'now')).toHaveLength(0);
  });
});
