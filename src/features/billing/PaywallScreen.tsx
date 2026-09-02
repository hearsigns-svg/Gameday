// THE paywall — one gate, two ways in (Round 5 model; Stage 3 builds the
// screen, Stage 4 the flow around it). What it shows: the headline, the
// three locks, monthly beside annual with the STORE'S localised price
// strings (never a hard-coded value), the trial badge only when the
// store says this account is eligible, the disclosures both stores
// require (price, term, auto-renewal, cancel any time), Restore, the
// Terms and Privacy links, and Continue with Free — hidden only by the
// hard-paywall flag for a proactive showing. Nothing explains an
// absence: with no offering the sheet simply does not open (the
// presenter is registered only once billing is configured).
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../core/navigation';
import { radius, spacing, type, useTheme } from '../../core/tokens';
import { t as tr } from '../../core/i18n';
import { showToast } from '../../core/toast';
import { flags } from '../../core/flags';
import {
  logPaywallAccepted,
  logPaywallDeclined,
  logPaywallShown,
} from '../../core/analytics';
import {
  loadPaywall,
  PaywallOffer,
  PaywallPackage,
  purchasePackage,
  restorePurchases,
  PRIVACY_URL,
  TERMS_URL,
} from '../../core/billing';

type Props = NativeStackScreenProps<RootStackParamList, 'Paywall'>;

export function PaywallScreen({ navigation, route }: Props) {
  const t = useTheme();
  const entry = route.params.entry;
  const [offer, setOffer] = useState<PaywallOffer | null>(null);
  const [failed, setFailed] = useState(false);
  const [chosen, setChosen] = useState<'annual' | 'monthly'>('annual');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void logPaywallShown(entry);
    void loadPaywall().then((r) => {
      if (r.ok) setOffer(r.value);
      else setFailed(true);
    });
  }, [entry]);

  // A proactive showing under the hard-paywall dial has no Continue with
  // Free; an on-demand showing is always dismissible (the user asked).
  const dismissible = entry === 'on_demand' || flags().paywallDismissible;

  const decline = () => {
    void logPaywallDeclined(entry);
    navigation.goBack();
  };

  const pkg: PaywallPackage | null =
    offer === null ? null : chosen === 'annual' ? offer.annual : offer.monthly;
  const trialOnChosen = chosen === 'annual' && (offer?.trialEligible ?? false);

  const buy = async () => {
    if (!pkg || busy) return;
    setBusy(true);
    const r = await purchasePackage(pkg.id);
    setBusy(false);
    if (!r.ok) {
      showToast({ message: tr('purchase.failed') });
      return;
    }
    if (r.value === 'cancelled') return;
    if (r.value === 'pending') {
      showToast({ message: tr('purchase.pending') });
      navigation.goBack();
      return;
    }
    void logPaywallAccepted(entry);
    navigation.goBack();
  };

  const restore = async () => {
    if (busy) return;
    setBusy(true);
    const r = await restorePurchases();
    setBusy(false);
    if (!r.ok) {
      showToast({ message: tr('purchase.failed') });
      return;
    }
    showToast({ message: tr(r.value.premium ? 'restore.found' : 'restore.none') });
    if (r.value.premium) navigation.goBack();
  };

  const saving =
    offer?.annual && offer.monthly && offer.monthly.price > 0
      ? Math.max(0, Math.round((1 - offer.annual.price / (offer.monthly.price * 12)) * 100))
      : null;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={{ padding: spacing.l, paddingBottom: spacing.xl }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
        {dismissible ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr('paywall.notNow')}
            hitSlop={12}
            onPress={decline}
            style={{ minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="close" size={24} color={t.textSecondary} />
          </Pressable>
        ) : null}
      </View>

      <Text style={[type.title, { color: t.textPrimary, marginTop: spacing.s }]}>
        {tr('paywall.headline')}
      </Text>
      <View style={{ marginTop: spacing.l, gap: spacing.s }}>
        {(['paywall.lockSync', 'paywall.lockReminders', 'paywall.lockColour'] as const).map(
          (k) => (
            <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.s }}>
              <Ionicons name="checkmark-circle" size={20} color={t.primary} />
              <Text style={[type.body, { color: t.textPrimary, flex: 1 }]}>{tr(k)}</Text>
            </View>
          ),
        )}
      </View>

      {offer === null && !failed ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={t.primary} />
      ) : null}
      {failed ? (
        <Text style={[type.secondary, { color: t.textSecondary, marginTop: spacing.xl }]}>
          {tr('paywall.unavailable')}
        </Text>
      ) : null}

      {offer ? (
        <>
          <View style={{ flexDirection: 'row', gap: spacing.m, marginTop: spacing.xl }}>
            {offer.annual ? (
              <PlanCard
                selected={chosen === 'annual'}
                onPress={() => setChosen('annual')}
                title={tr('paywall.annual')}
                price={tr('paywall.pricePerYear', { price: offer.annual.priceString })}
                badge={
                  offer.trialEligible
                    ? tr('paywall.trialBadge')
                    : saving && saving > 0
                      ? tr('paywall.annualSaving', { percent: String(saving) })
                      : null
                }
              />
            ) : null}
            {offer.monthly ? (
              <PlanCard
                selected={chosen === 'monthly'}
                onPress={() => setChosen('monthly')}
                title={tr('paywall.monthly')}
                price={tr('paywall.pricePerMonth', { price: offer.monthly.priceString })}
                badge={null}
              />
            ) : null}
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: busy || !pkg }}
            onPress={() => void buy()}
            style={({ pressed }) => [
              {
                marginTop: spacing.l,
                minHeight: 52,
                borderRadius: radius.card,
                backgroundColor: t.primary,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed || busy ? 0.8 : 1,
              },
            ]}
          >
            {busy ? (
              <ActivityIndicator color={t.onPrimary} />
            ) : (
              <Text style={[type.body, { color: t.onPrimary, fontWeight: '700' }]}>
                {tr(trialOnChosen ? 'paywall.startTrial' : 'paywall.subscribe')}
              </Text>
            )}
          </Pressable>

          {/* The disclosure both stores require: price, term, renewal, cancel. */}
          <Text style={[type.caption, { color: t.textSecondary, marginTop: spacing.m }]}>
            {trialOnChosen && offer.annual
              ? tr('paywall.trialRenewal', { price: offer.annual.priceString })
              : tr('paywall.renewal')}
          </Text>

          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'center',
              gap: spacing.l,
              marginTop: spacing.l,
              flexWrap: 'wrap',
            }}
          >
            <LinkText label={tr('paywall.restore')} onPress={() => void restore()} colour={t.primary} />
            <LinkText label={tr('paywall.terms')} onPress={() => void Linking.openURL(TERMS_URL)} colour={t.textSecondary} />
            <LinkText label={tr('paywall.privacy')} onPress={() => void Linking.openURL(PRIVACY_URL)} colour={t.textSecondary} />
          </View>

          {dismissible ? (
            <Pressable
              accessibilityRole="button"
              onPress={decline}
              style={{ marginTop: spacing.l, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={[type.body, { color: t.textSecondary, fontWeight: '600' }]}>
                {tr('paywall.notNow')}
              </Text>
            </Pressable>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}

function PlanCard(props: {
  selected: boolean;
  onPress: () => void;
  title: string;
  price: string;
  badge: string | null;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: props.selected }}
      accessibilityLabel={`${props.title}, ${props.price}${props.badge ? `, ${props.badge}` : ''}`}
      onPress={props.onPress}
      style={{
        flex: 1,
        minHeight: 96,
        borderRadius: radius.card,
        borderWidth: props.selected ? 2 : 1,
        borderColor: props.selected ? t.primary : t.border,
        backgroundColor: t.surface,
        padding: spacing.m,
        justifyContent: 'space-between',
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={[type.body, { color: t.textPrimary, fontWeight: '700' }]}>{props.title}</Text>
        {props.badge ? (
          <View
            style={{
              backgroundColor: t.primary,
              borderRadius: radius.pill ?? 999,
              paddingHorizontal: spacing.s,
              paddingVertical: 2,
            }}
          >
            <Text style={[type.caption, { color: t.onPrimary, fontWeight: '700' }]}>{props.badge}</Text>
          </View>
        ) : null}
      </View>
      <Text style={[type.secondary, { color: t.textSecondary }]}>{props.price}</Text>
    </Pressable>
  );
}

function LinkText(props: { label: string; onPress: () => void; colour: string }) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={props.onPress}
      hitSlop={8}
      style={{ minHeight: 44, justifyContent: 'center' }}
    >
      <Text style={[type.secondary, { color: props.colour, fontWeight: '600' }]}>{props.label}</Text>
    </Pressable>
  );
}
