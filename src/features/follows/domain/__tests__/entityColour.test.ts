import { colourFromKitText } from '../entityColour';

it('takes the dominant (first-listed) colour', () => {
  expect(colourFromKitText('Red / White')).toBe('#C81E1E');
  expect(colourFromKitText('White / Red')).toBe('#FFFFFF');
});

it('prefers the specific shade over the generic word', () => {
  // "Sky Blue" must not resolve to plain blue.
  expect(colourFromKitText('Claret / Sky Blue')).toBe('#7B1F2B');
  expect(colourFromKitText('Sky Blue / White')).toBe('#6CABDD');
  expect(colourFromKitText('Navy Blue / White')).toBe('#1E3A8A');
});

it('handles unknown or absent text', () => {
  expect(colourFromKitText('Tartan / Paisley')).toBeNull();
  expect(colourFromKitText('')).toBeNull();
  expect(colourFromKitText(null)).toBeNull();
});
