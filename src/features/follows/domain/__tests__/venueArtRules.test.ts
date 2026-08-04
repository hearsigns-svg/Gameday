import {
  commonsThumbUrl,
  isAllowedLicence,
  stripHtml,
} from '../venueArtRules';

describe('licence allowlist — commercial use only', () => {
  it.each(['CC BY-SA 4.0', 'CC BY 2.0', 'CC BY-SA 3.0 de', 'CC0', 'Public domain'])(
    'allows %s',
    (l) => expect(isAllowedLicence(l)).toBe(true),
  );
  it.each([
    'CC BY-NC 4.0',
    'CC BY-NC-SA 2.0',
    'CC BY-ND 4.0',
    'All rights reserved',
    '',
    undefined,
  ])('rejects %s', (l) => expect(isAllowedLicence(l as string)).toBe(false));
});

it('strips HTML from Commons artist markup', () => {
  expect(
    stripHtml('<a href="//commons.wikimedia.org/wiki/User:X">Arne Müseler</a>'),
  ).toBe('Arne Müseler');
  expect(stripHtml(undefined)).toBe('');
});

it('builds a stable sized thumb URL', () => {
  expect(commonsThumbUrl('File:Liverpool anfield road stadium.jpg', 1280)).toBe(
    'https://commons.wikimedia.org/wiki/Special:FilePath/Liverpool_anfield_road_stadium.jpg?width=1280',
  );
});

describe('pickTournamentCandidate (Prompt 9c)', () => {
  const { pickTournamentCandidate } = jest.requireActual<
    typeof import('../venueArtRules')
  >('../venueArtRules');
  // The live Wimbledon shape: 4 of 5 candidates are transit/geography.
  const wimbledon = [
    { id: 'Q113112546', description: 'tube stop on the London Underground in the United Kingdom' },
    { id: 'Q113112485', description: 'stop on the Croydon Tramlink line in the United Kingdom' },
    { id: 'Q801616', description: 'railway station in Wimbledon, London Borough of Merton, England, UK' },
    { id: 'Q736742', description: 'suburb of London' },
    { id: 'Q41520', description: 'tennis tournament held in London' },
  ];

  test('only the tennis-shaped candidate qualifies', () => {
    expect(pickTournamentCandidate(wimbledon)).toBe('Q41520');
  });

  test('the city breaks ties between tennis-shaped candidates', () => {
    const two = [
      { id: 'Q1', description: 'tennis tournament held in Melbourne' },
      { id: 'Q2', description: 'tennis tournament held in New York City' },
    ];
    expect(pickTournamentCandidate(two, 'New York, NY, USA')).toBe('Q2');
    expect(pickTournamentCandidate(two, 'Melbourne Australia')).toBe('Q1');
    expect(pickTournamentCandidate(two)).toBe('Q1'); // no city → first shaped
  });

  test('no tennis-shaped candidate → null, never a tube stop', () => {
    expect(
      pickTournamentCandidate(wimbledon.slice(0, 4), 'London UK'),
    ).toBeNull();
  });
});

// ─── Person candidates (Prompt 16 B) ──────────────────────────────────
//
// Measured against production names on 2026-08-04: the old rule — first
// candidate carrying an image, competition-shaped descriptions excluded
// — returned the WRONG PERSON for 3 of 10 boxing hits. Each case below
// is one of those, verbatim from Wikidata.

describe('pickAthleteCandidate', () => {
  const { pickAthleteCandidate, isAthleteCandidate } =
    jest.requireActual<typeof import('../venueArtRules')>('../venueArtRules');

  test('refuses the famous namesake', () => {
    expect(
      pickAthleteCandidate(
        [{ id: 'Q182047', description: 'writer' }],
        'boxing',
      ),
    ).toBeNull();
    expect(
      pickAthleteCandidate(
        [
          {
            id: 'Q2831211',
            description: 'American computer hacker and computer criminal',
          },
        ],
        'boxing',
      ),
    ).toBeNull();
    // A rhythmic gymnast shares a name with the tennis player.
    expect(
      pickAthleteCandidate(
        [{ id: 'Q15710756', description: 'British rhythmic gymnast' }],
        'tennis',
      ),
    ).toBeNull();
  });

  test('accepts the athlete when the description says so', () => {
    expect(
      pickAthleteCandidate(
        [
          { id: 'Q1', description: 'American computer criminal' },
          { id: 'Q2', description: 'American professional boxer' },
        ],
        'boxing',
      ),
    ).toBe('Q2');
  });

  test('two plausible people is ambiguity, not a tie to break', () => {
    expect(
      pickAthleteCandidate(
        [
          { id: 'Q1', description: 'British boxer' },
          { id: 'Q2', description: 'American professional boxer' },
        ],
        'boxing',
      ),
    ).toBeNull();
  });

  test('an undescribed candidate is unverifiable, so it is refused', () => {
    expect(isAthleteCandidate(undefined, 'boxing')).toBe(false);
    expect(isAthleteCandidate('', 'boxing')).toBe(false);
  });

  test('a bout is not a boxer, and a statistics item is not a player', () => {
    // Live-measured 2026-08-04: searching "Tyson Fury" returns the
    // fighter AND his bouts ("boxing competition", "Cancelled boxing
    // bout"); every top tennis player has "professional statistics of
    // …" and "2025 tennis player season" items. All of them match a
    // sport-shaped test, and without this filter the uniqueness rule
    // refused the correct portrait for almost every famous athlete.
    expect(
      pickAthleteCandidate(
        [
          { id: 'Q1000592', description: 'British boxer (born 1988)' },
          { id: 'Q106972137', description: 'boxing competition' },
          { id: 'Q24024788', description: 'Cancelled boxing bout' },
        ],
        'boxing',
        'Tyson Fury',
      ),
    ).toBe('Q1000592');
    expect(
      pickAthleteCandidate(
        [
          { id: 'Q23448791', description: 'Belarusian tennis player' },
          { id: 'Q60753798', description: 'professional statistics of a tennis player' },
          { id: 'Q131850945', description: '2025 tennis player season' },
        ],
        'tennis',
        'Aryna Sabalenka',
      ),
    ).toBe('Q23448791');
  });

  test('a surname alone resolves to nobody', () => {
    // Combat titles carry them ("UFC 330 Makhachev vs Machado Garry"),
    // and a confident single match on one word is where a wrong person
    // is most likely. Same rule as minting an athlete (F31).
    expect(
      pickAthleteCandidate(
        [{ id: 'Q1', description: 'Russian mixed martial artist' }],
        'ufc',
        'Makhachev',
      ),
    ).toBeNull();
    expect(
      pickAthleteCandidate(
        [{ id: 'Q18637676', description: 'Russian mixed martial artist' }],
        'ufc',
        'Islam Makhachev',
      ),
    ).toBe('Q18637676');
  });

  test('a sport with no shape gets no photo rather than a guess', () => {
    expect(isAthleteCandidate('American professional boxer', 'soccer')).toBe(
      false,
    );
  });
});
