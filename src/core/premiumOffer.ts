// The on-demand way into the offer from a Premium control in the free
// state (Round 5 paywall model; AGENTS rule 19): the paywall — or, when it
// is suppressed after a decline this session or billing is not
// configured, the inline Premium line, never a silent no-op. ONE routine
// for every locked control (the Settings switches and colour swatches,
// the calendar glyph, the fixture card's colour row), so they behave
// alike by construction.

import { t } from './i18n';
import { requestPaywall } from './paywall';
import { showToast } from './toast';

export function offerPremium(): void {
  if (!requestPaywall('on_demand')) showToast({ message: t('premium.syncRow') });
}
