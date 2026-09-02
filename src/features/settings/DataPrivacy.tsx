// Data & privacy rows (Stage 7B). The vocabulary is deliberately NOT
// "Sign out" / "Delete account": auth is anonymous, there is no account
// to sign out of, and pretending otherwise is dishonest chrome — those
// words arrive only when real account linking does.
//
// Erase = the app-created calendar and everything in it, past events
// included (the sanctioned exception to the future-only horizon rule).
// Delete & reset = red, double-confirmed, with the optional calendar
// erase folded into the confirmation; the ordering lives in
// accountReset.ts, not here.

import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
  Linking,
} from 'react-native';
import { t as tr, tn } from '../../core/i18n';
import { radius, spacing, type, useTheme } from '../../core/tokens';
import { showToast } from '../../core/toast';
import { manageSubscriptionUrl } from '../../core/billing';
import {
  deleteAllDataAndReset,
  eraseSyncedEvents,
  ownCalendarEraseMode,
} from '../calendar-sync/data/accountReset';
import { activeBackend } from '../calendar-sync/data/calendarBackend';
import { storedTarget } from '../calendar-sync/data/calendarTargetStore';
import { nativeSyncRoute } from '../calendar-sync/data/driver';
import { messageOf } from '../../core/result';
import { runSync } from '../calendar-sync/syncEngine';

// Erase needs a write path to the calendar: iOS always has one
// (EventKit); Android only while the Google grant lives.
function eraseAvailable(): boolean {
  return activeBackend() === 'rest' || nativeSyncRoute() === 'provider';
}

export function DataPrivacyRows(props: { onReset: () => void }) {
  const t = useTheme();
  const [open, setOpen] = useState<'erase' | 'delete' | null>(null);
  const [armed, setArmed] = useState(false); // delete's second confirmation
  const [alsoErase, setAlsoErase] = useState(false);
  const [busy, setBusy] = useState<'erase' | 'delete' | null>(null);
  const canErase = eraseAvailable();

  const toggleOpen = (which: 'erase' | 'delete') => {
    setArmed(false);
    setOpen((v) => (v === which ? null : which));
  };

  const runErase = async () => {
    setBusy('erase');
    const r = await eraseSyncedEvents();
    setBusy(null);
    if (!r.ok) {
      showToast({ message: messageOf(r.error) });
      return;
    }
    const { mode, failed } = r.value;
    if (failed > 0) {
      // Failed deletes kept their ledger entries: protection and retry
      // survive, and the user hears it rather than assuming done.
      showToast({
        message: tn('settings.privacy.eraseFailed', failed),
      });
      return;
    }
    setOpen(null);
    showToast({
      message:
        mode === 'nothing'
          ? tr('settings.privacy.nothingToErase')
          : tr('settings.privacy.erased'),
    });
    // Still connected → the next sync re-adds future events; run it now
    // rather than leaving a gap.
    void runSync();
  };

  const runDelete = async () => {
    setBusy('delete');
    const r = await deleteAllDataAndReset({
      eraseCalendar: alsoErase && canErase,
    });
    setBusy(null);
    if (!r.ok) {
      showToast({ message: messageOf(r.error) });
      setArmed(false);
      return;
    }
    props.onReset();
  };

  const actionButton = (
    label: string,
    onPress: () => void,
    danger: boolean,
    isBusy: boolean,
  ) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={isBusy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        danger
          ? { backgroundColor: t.danger }
          : { borderColor: t.border, borderWidth: StyleSheet.hairlineWidth },
        pressed && { opacity: 0.7 },
      ]}
    >
      {isBusy ? (
        <ActivityIndicator size="small" color={danger ? t.onPrimary : t.textPrimary} />
      ) : (
        <Text
          style={[
            type.secondary,
            { fontWeight: '600', color: danger ? t.onPrimary : t.textPrimary },
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );

  return (
    <>
      {/* ── Erase synced events ─────────────────────────────────── */}
      <View
        style={[
          styles.rowBlock,
          { borderColor: t.border, borderBottomWidth: StyleSheet.hairlineWidth },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr('settings.privacy.erase')}
          accessibilityState={{
            disabled: !canErase,
            expanded: open === 'erase',
          }}
          disabled={!canErase}
          onPress={() => toggleOpen('erase')}
          style={[styles.row, !canErase && { opacity: 0.45 }]}
        >
          <Text style={[type.body, { color: t.textPrimary, flex: 1 }]}>
            {tr('settings.privacy.erase')}
          </Text>
        </Pressable>
        {open === 'erase' ? (
          <View style={styles.confirm}>
            <Text style={[type.caption, { color: t.textSecondary }]}>
              {ownCalendarEraseMode()
                ? tr('settings.privacy.eraseOwnTarget', {
                    calendar:
                      storedTarget()?.label ??
                      tr('settings.words.yourCalendar'),
                  })
                : tr('settings.privacy.eraseOurs')}
              {' '}
              {tr('settings.privacy.eraseResync')}
            </Text>
            <View style={styles.actions}>
              {actionButton(tr('core.actions.cancel'), () => setOpen(null), false, false)}
              {actionButton(tr('settings.privacy.eraseAction'), () => void runErase(), true, busy === 'erase')}
            </View>
          </View>
        ) : null}
      </View>

      {/* ── Delete my data & reset ──────────────────────────────── */}
      <View style={styles.rowBlock}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr('settings.privacy.deleteA11y')}
          accessibilityState={{ expanded: open === 'delete' }}
          onPress={() => toggleOpen('delete')}
          style={styles.row}
        >
          <Text style={[type.body, { color: t.danger, fontWeight: '600', flex: 1 }]}>
            {tr('settings.privacy.deleteTitle')}
          </Text>
        </Pressable>
        {open === 'delete' ? (
          <View style={styles.confirm}>
            <Text style={[type.caption, { color: t.textSecondary }]}>
              {tr('settings.privacy.deleteBody')}
            </Text>
            {/* Round 5 Stage 3: deletion removes our data, not a store
                subscription — say so, and hand over the store's page. */}
            <Text style={[type.caption, { color: t.textSecondary, marginTop: spacing.s }]}>
              {tr('deleteData.subscriptionNote')}
            </Text>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={tr('entitlement.manage')}
              onPress={() => void manageSubscriptionUrl().then((u) => Linking.openURL(u))}
              style={{ minHeight: 44, justifyContent: 'center' }}
            >
              <Text style={[type.secondary, { color: t.primary, fontWeight: '600' }]}>
                {tr('entitlement.manage')}
              </Text>
            </Pressable>
            <View style={styles.toggleRow}>
              <Text
                style={[
                  type.secondary,
                  {
                    color: canErase ? t.textPrimary : t.textSecondary,
                    flex: 1,
                    opacity: canErase ? 1 : 0.45,
                  },
                ]}
              >
                {tr('settings.privacy.alsoErase')}
              </Text>
              <Switch
                accessibilityLabel={tr('settings.privacy.alsoErase')}
                disabled={!canErase}
                value={alsoErase && canErase}
                onValueChange={setAlsoErase}
              />
            </View>
            {armed ? (
              <>
                <Text style={[type.secondary, { color: t.danger, fontWeight: '600' }]}>
                  {tr('settings.privacy.cantUndo')}
                </Text>
                <View style={styles.actions}>
                  {actionButton(tr('core.actions.cancel'), () => setArmed(false), false, false)}
                  {actionButton(tr('settings.privacy.deleteAction'), () => void runDelete(), true, busy === 'delete')}
                </View>
              </>
            ) : (
              <View style={styles.actions}>
                {actionButton(tr('core.actions.cancel'), () => setOpen(null), false, false)}
                {actionButton(tr('settings.privacy.deleteMyData'), () => setArmed(true), true, false)}
              </View>
            )}
          </View>
        ) : null}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  rowBlock: {},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingHorizontal: spacing.l,
    paddingVertical: spacing.s,
  },
  confirm: {
    paddingHorizontal: spacing.l,
    paddingBottom: spacing.m,
    gap: spacing.m,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    minHeight: 44,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.m,
  },
  action: {
    minHeight: 44,
    minWidth: 96,
    paddingHorizontal: spacing.l,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
