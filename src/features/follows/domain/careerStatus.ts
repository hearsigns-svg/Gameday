// Recorded retirement, in the user's words.
//
// ONE source for the three places it surfaces — the browse/search row
// caption, the athlete page's empty state, and the post-follow toast —
// so the app can never say three different things about the same
// person. Pure: no imports, fully testable.
//
// THE FIELD IS SET ONLY WHERE A SOURCE STATES IT (Prompt 12): Wikidata's
// end-of-work-period year or a date of death. It covers 7.9% of the ATP
// roster and its newest value is 2024, so ABSENCE IS SILENCE — not a
// claim that the athlete competes. That is why there is deliberately no
// "active"/"still playing" copy in this module to pair with these: the
// app never tells a user someone is currently playing, because for most
// of the directory it does not know.

export interface CareerStatusFields {
  careerStatus?: 'retired';
  careerEndYear?: number;
}

export function isRetired(a: CareerStatusFields | null | undefined): boolean {
  return a?.careerStatus === 'retired';
}

// Row caption: "Retired 2022". Leads the caption where it applies —
// for the ATP directory it is usually the ONLY thing we know (no rank,
// no country, no scheduled event), so without it those rows carry
// nothing but the group name.
export function retiredCaption(a: CareerStatusFields): string | null {
  if (!isRetired(a)) return null;
  return a.careerEndYear !== undefined
    ? `Retired ${a.careerEndYear}`
    : 'Retired';
}

// The athlete page's empty state. "No scheduled events. We'll add them
// when announced" is a promise, and it is a false one for someone who
// stopped playing in 2022.
export function retiredEmptyState(a: CareerStatusFields): string | null {
  if (!isRetired(a)) return null;
  return a.careerEndYear !== undefined
    ? `Retired in ${a.careerEndYear} — no upcoming events are expected.`
    : 'Retired — no upcoming events are expected.';
}

// The post-follow toast. Following a retired player is ALLOWED and
// deliberately so: the marker is high-precision but low-recall, so
// blocking would refuse Federer while waving through the equally
// retired players Wikidata simply has not marked — an arbitrary line
// dressed up as a rule. A follow also costs nothing (it writes no
// calendar event) and exhibition returns happen. So: warn, don't block.
export function retiredFollowNote(
  label: string,
  a: CareerStatusFields,
): string | null {
  if (!isRetired(a)) return null;
  return a.careerEndYear !== undefined
    ? `Following ${label} — retired in ${a.careerEndYear}, no new events expected`
    : `Following ${label} — retired, no new events expected`;
}
