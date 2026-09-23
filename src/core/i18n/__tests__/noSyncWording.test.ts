// "Sync" is retired from the app's words (owner brief "Per-follow calendar
// control and motorsport sessions", Stage 6): the app speaks of adding to
// your calendar, being in your calendar, and being removed from it. The
// one standing exception the brief names — Connect / Disconnect Google
// Calendar — carries no "sync" either, so the rule has no exceptions.
// Keys may still say sync (they are code); VALUES, in every language,
// may not.
import { en } from '../catalog/en';
import { es } from '../catalog/es';
import { de } from '../catalog/de';
import { fr } from '../catalog/fr';
import { it as itCatalog } from '../catalog/it';
import { pt } from '../catalog/pt';

// sync / synced / syncing, Sincronización / sincronizar, Synchronisierung
// / synchronisiert, synchronisation / synchronisé, sincronizzazione,
// sincronização — every working-set language's form of the word.
const SYNC_WORD = /sync|sincroni|synchroni/i;

const catalogs = { en, es, de, fr, it: itCatalog, pt } as const;

test.each(Object.entries(catalogs))('no %s string says "sync"', (_lang, catalog) => {
  const offenders = Object.entries(catalog as Record<string, string>)
    .filter(([, value]) => SYNC_WORD.test(value))
    .map(([key, value]) => `${key}: ${value}`);
  expect(offenders).toEqual([]);
});
