import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, EmptyState, Row } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useQuery } from '@/hooks/use-query';
import { useTheme } from '@/hooks/use-theme';
import { addDays, daysBetween, formatPlDate, toISODate } from '@/lib/dates';
import { listCoupons, walletSummary, type Coupon, type CouponStatus } from '@/lib/db/coupons';
import { getDb } from '@/lib/db';
import { getStore, storeLabel } from '@/lib/db/stores';
import { useWalletRevision } from '@/lib/events';
import { countCoupons, DAY_FORMS, plural } from '@/lib/i18n';
import { formatGrosze } from '@/lib/money';

const TABS: { status: CouponStatus; label: string }[] = [
  { status: 'active', label: 'Aktywne' },
  { status: 'redeemed', label: 'Wykorzystane' },
  { status: 'expired', label: 'Wygasłe' },
];

function expiryText(c: Coupon, today: string): { text: string; urgent: boolean } | null {
  if (!c.expiresOn) return null;
  const days = daysBetween(today, c.expiresOn);
  if (c.status !== 'active') return { text: `ważny do ${formatPlDate(c.expiresOn)}`, urgent: false };
  if (days === 0) return { text: 'ostatni dzień ważności!', urgent: true };
  if (days === 1) return { text: 'ważny do jutra', urgent: true };
  return { text: `ważny do ${formatPlDate(c.expiresOn)} (${days} ${plural(days, DAY_FORMS)})`, urgent: days <= 3 };
}

export default function WalletScreen() {
  const router = useRouter();
  const theme = useTheme();
  const params = useLocalSearchParams<{ store?: string }>();
  const storeFilter = params.store ? Number(params.store) : null;
  const revision = useWalletRevision();

  const [status, setStatus] = useState<CouponStatus>('active');
  const today = toISODate(new Date());
  const { data } = useQuery(async () => {
    const db = await getDb();
    const [list, summary, store] = await Promise.all([
      listCoupons(db, status),
      walletSummary(db, addDays(toISODate(new Date()), 3)),
      storeFilter ? getStore(db, storeFilter) : Promise.resolve(null),
    ]);
    return {
      coupons: storeFilter ? list.filter((c) => c.storeId === storeFilter) : list,
      summary,
      storeName: store ? storeLabel(store) : null,
    };
  }, [status, storeFilter, revision]);
  const coupons = data?.coupons ?? [];
  const summary = data?.summary ?? null;
  const storeName = data?.storeName ?? null;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.background }}>
      <FlatList
        data={coupons}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={{ gap: Spacing.three }}>
            <ThemedText type="title">Portfel</ThemedText>
            <Card style={{ backgroundColor: theme.tint, borderColor: theme.tint }}>
              <ThemedText type="small" style={{ color: theme.onTint }}>
                Do odebrania
              </ThemedText>
              <ThemedText type="title" style={{ color: theme.onTint }} accessibilityLabel={`Do odebrania ${formatGrosze(summary?.activeSumGrosze ?? 0)}`}>
                {formatGrosze(summary?.activeSumGrosze ?? 0)}
              </ThemedText>
              <ThemedText style={{ color: theme.onTint }}>{countCoupons(summary?.activeCount ?? 0)} aktywnych</ThemedText>
              {summary && summary.expiringSoonCount > 0 ? (
                <ThemedText type="smallBold" style={{ color: theme.onTint }}>
                  ⚠ {countCoupons(summary.expiringSoonCount)} ({formatGrosze(summary.expiringSoonSumGrosze)}) traci ważność w ciągu 3 dni
                </ThemedText>
              ) : null}
            </Card>
            <Button title="Dodaj kupon" onPress={() => router.push('/coupon/new')} />
            {storeFilter ? (
              <Row style={{ justifyContent: 'space-between' }}>
                <ThemedText type="smallBold">Kupony w: {storeName ?? 'sklep'}</ThemedText>
                <Button title="Pokaż wszystkie" variant="ghost" onPress={() => router.setParams({ store: undefined })} />
              </Row>
            ) : null}
            <Row>
              {TABS.map((t) => (
                <Chip key={t.status} label={t.label} selected={status === t.status} onPress={() => setStatus(t.status)} />
              ))}
            </Row>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            title={status === 'active' ? 'Brak aktywnych kuponów' : 'Pusto'}
            description={status === 'active' ? 'Zrób zdjęcie kuponu z automatu, a przypomnimy o nim przy sklepie i przed końcem ważności.' : undefined}
          />
        }
        renderItem={({ item }) => {
          const expiry = expiryText(item, today);
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Kupon ${formatGrosze(item.amountGrosze)}${item.store ? `, ${storeLabel(item.store)}` : ''}`}
              onPress={() => router.push(`/coupon/${item.id}`)}
              style={({ pressed }) => [styles.item, { backgroundColor: theme.card, borderColor: theme.border, opacity: pressed ? 0.8 : 1 }]}>
              <View style={{ flex: 1, gap: 2 }}>
                <ThemedText type="smallBold">{item.store ? storeLabel(item.store) : 'Sklep nieprzypisany'}</ThemedText>
                {expiry ? (
                  <ThemedText type="small" style={{ color: expiry.urgent ? theme.danger : theme.textSecondary }}>
                    {expiry.text}
                  </ThemedText>
                ) : (
                  <ThemedText type="small" themeColor="textSecondary">
                    bez daty ważności
                  </ThemedText>
                )}
              </View>
              <ThemedText type="subtitle">{formatGrosze(item.amountGrosze)}</ThemedText>
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  list: { padding: Spacing.three, gap: Spacing.two, paddingBottom: 120 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.medium,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
