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
