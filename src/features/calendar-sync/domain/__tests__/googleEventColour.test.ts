import { GOOGLE_EVENT_COLOURS, googleColorIdFor } from '../googleEventColour';

// The product palette (screens/FixtureCard.tsx EVENT_COLOURS) and where
// each swatch should land.
const PALETTE: Array<[string, string]> = [
  ['#C22A2A', '11'], // red → Tomato
  ['#D97706', '5'], // amber (yellow-orange) → Banana, the nearer hue; Tangerine is red-orange
  ['#0B7A4B', '10'], // green → Basil
  ['#1463F3', '7'], // brand blue (vivid azure) → Peacock, its nearest hue; Blueberry is indigo
  ['#6D28D9', '3'], // violet → Grape
  ['#111111', '8'], // near-black → Graphite
];

describe('googleColorIdFor', () => {
  it('maps every product swatch to the expected Google colour', () => {
    for (const [hex, id] of PALETTE) expect(googleColorIdFor(hex)).toBe(id);
  });

  it('is exact on the Google swatches themselves', () => {
    for (const s of GOOGLE_EVENT_COLOURS) expect(googleColorIdFor(s.hex)).toBe(s.id);
  });

  it('accepts lower-case and bare hex, rejects garbage with null (never throws)', () => {
    expect(googleColorIdFor('d50000')).toBe('11');
    expect(googleColorIdFor('#d50000')).toBe('11');
    expect(googleColorIdFor('red')).toBeNull();
    expect(googleColorIdFor('#fff')).toBeNull();
    expect(googleColorIdFor('')).toBeNull();
  });
});
