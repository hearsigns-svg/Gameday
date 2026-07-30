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
