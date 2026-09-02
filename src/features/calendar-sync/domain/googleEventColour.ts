// Google Calendar event colours — PURE. Round 5 ruling 7: the per-event
// colour was a dead path under REST (capability true, value never
// mapped). Google events take an eleven-swatch `colorId`, not hex; the
// product palette (screens/FixtureCard.tsx EVENT_COLOURS) is mapped to
// the NEAREST swatch by RGB distance, so a picked red lands on Tomato,
// not on a random index. Reference swatches are Google's documented
// event colours (colors.get, `event` map).

export const GOOGLE_EVENT_COLOURS: ReadonlyArray<{ id: string; hex: string; name: string }> = [
  { id: '1', hex: '#7986CB', name: 'Lavender' },
  { id: '2', hex: '#33B679', name: 'Sage' },
  { id: '3', hex: '#8E24AA', name: 'Grape' },
  { id: '4', hex: '#E67C73', name: 'Flamingo' },
  { id: '5', hex: '#F6BF26', name: 'Banana' },
  { id: '6', hex: '#F4511E', name: 'Tangerine' },
  { id: '7', hex: '#039BE5', name: 'Peacock' },
  { id: '8', hex: '#616161', name: 'Graphite' },
  { id: '9', hex: '#3F51B5', name: 'Blueberry' },
  { id: '10', hex: '#0B8043', name: 'Basil' },
  { id: '11', hex: '#D50000', name: 'Tomato' },
];

function rgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Hue (degrees), saturation and lightness in [0, 1] — HSL, the space
// where "which swatch is this colour" is a question about hue first.
function hsl([r, g, b]: [number, number, number]): { h: number; s: number; l: number } {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === R) h = ((G - B) / d) % 6;
  else if (max === G) h = (B - R) / d + 2;
  else h = (R - G) / d + 4;
  h = (h * 60 + 360) % 360;
  return { h, s, l };
}

const GREY_SATURATION = 0.2;
const GRAPHITE_ID = '8';

// Nearest swatch id, or null for an unparseable colour (the event then
// simply wears the calendar's colour — never a thrown error mid-sync).
// A grey (near-black, near-white, silver) is Graphite, the one grey
// swatch: RGB distance would send black to the darkest GREEN. Everything
// else is matched on hue first, then lightness, then saturation.
export function googleColorIdFor(hex: string): string | null {
  const c = rgb(hex);
  if (!c) return null;
  const x = hsl(c);
  if (x.s < GREY_SATURATION) return GRAPHITE_ID;
  let best: { id: string; d: number } | null = null;
  for (const sw of GOOGLE_EVENT_COLOURS) {
    if (sw.id === GRAPHITE_ID) continue;
    const y = hsl(rgb(sw.hex)!);
    const dh = Math.abs(x.h - y.h);
    const hue = Math.min(dh, 360 - dh) / 180;
    const d = hue + 0.5 * Math.abs(x.l - y.l) + 0.25 * Math.abs(x.s - y.s);
    if (!best || d < best.d) best = { id: sw.id, d };
  }
  return best ? best.id : null;
}
