// Athlete identity without a likeness (Prompt 16 B): flag + division
// colour + the existing monogram.

import { athleteIdentity, divisionHue, nationCaption } from '../athleteIdentity';

describe('athleteIdentity', () => {
  it('gives a boxer their flag and their division’s colour', () => {
    const a = athleteIdentity({
      sportKey: 'boxing',
      countryCode: 'GBR',
      groupingKey: 'Heavyweight',
      accentHue: 247,
    });
    expect(a.flag).toBe('🇬🇧');
    expect(a.nation).toBe('United Kingdom');
    // The weight class decides the tone, so every heavyweight reads as
    // one family and the flag does the distinguishing.
    expect(a.hue).toBe(divisionHue('Heavyweight'));
    expect(a.hue).not.toBe(247);
  });

  it('every fighter in a division shares its colour; divisions differ', () => {
    const hue = (grouping: string) =>
      athleteIdentity({ sportKey: 'boxing', groupingKey: grouping }).hue;
    expect(hue('Heavyweight')).toBe(hue('Heavyweight'));
    expect(hue('Heavyweight')).not.toBe(hue('Welterweight'));
    expect(hue('Heavyweight')).not.toBe(hue("Women's Flyweight"));
  });

  it('leaves tennis and F1 on their per-athlete hue', () => {
    // A tour is not a division: colouring 1,374 ATP players identically
    // would remove information rather than add it.
    expect(
      athleteIdentity({
        sportKey: 'tennis',
        groupingKey: 'ATP Tour — Men',
        accentHue: 330,
      }).hue,
    ).toBe(330);
    expect(
      athleteIdentity({ sportKey: 'f1', groupingKey: 'Formula 1', accentHue: 12 })
        .hue,
    ).toBe(12);
  });

  it('says nothing about a nationality it does not have', () => {
    const a = athleteIdentity({ sportKey: 'boxing', groupingKey: 'Cruiserweight' });
    expect(a.flag).toBeNull();
    expect(a.nation).toBeNull();
  });

  it('hues stay inside the wheel', () => {
    for (const key of ['Heavyweight', 'Minimumweight', "Women's Jr Featherweight"]) {
      const h = divisionHue(key);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(360);
    }
  });
});

describe('nationCaption', () => {
  it('shows the flag AND the code, so a font without flags still says it', () => {
    expect(nationCaption('MEX')).toBe('🇲🇽 MEX');
    expect(nationCaption('ENG')).toBe('🏴󠁧󠁢󠁥󠁮󠁧󠁿 ENG');
  });

  it('falls back to whatever the source said for a code we do not know', () => {
    expect(nationCaption('XYZ')).toBe('XYZ');
    expect(nationCaption(undefined)).toBeNull();
  });

  it('prints the code alone where no flag glyph exists', () => {
    expect(nationCaption('NIR')).toBe('NIR');
  });
});
