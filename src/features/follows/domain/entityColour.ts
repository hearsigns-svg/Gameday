// Kit-colour text → a representative hue. Providers publish colours as
// prose ("Red / White", "Claret / Sky Blue"); we only need a hue
// carrier — teamTheme() tone-maps whatever we pick, so approximate is
// fine and wrong-but-close beats absent. Pure; unit-tested.

const COLOUR_HEX: Array<[RegExp, string]> = [
  [/claret|maroon|burgundy/, '#7B1F2B'],
  [/crimson|scarlet/, '#DC2626'],
  [/red/, '#C81E1E'],
  [/sky blue|light blue/, '#6CABDD'],
  [/navy|dark blue/, '#1E3A8A'],
  [/royal blue/, '#2447D8'],
  [/blue/, '#1D4ED8'],
  [/yellow/, '#F5C500'],
  [/amber|gold/, '#D4A017'],
  [/orange|tangerine/, '#EA580C'],
  [/emerald/, '#059669'],
  [/green/, '#15803D'],
  [/purple|violet/, '#6D28D9'],
  [/lilac/, '#A78BFA'],
  [/pink/, '#DB2777'],
  [/teal/, '#0D9488'],
  [/brown/, '#854D0E'],
  [/silver/, '#9CA3AF'],
  [/grey|gray/, '#6B7280'],
  [/black/, '#111111'],
  [/white/, '#FFFFFF'],
];

// First recognised colour wins — providers list the dominant kit colour
// first ("Red / White" → red).
export function colourFromKitText(
  text: string | null | undefined,
): string | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  let best: { index: number; hex: string } | null = null;
  for (const [re, hex] of COLOUR_HEX) {
    const m = lower.match(re);
    if (m && m.index !== undefined && (!best || m.index < best.index)) {
      best = { index: m.index, hex };
    }
  }
  return best?.hex ?? null;
}
