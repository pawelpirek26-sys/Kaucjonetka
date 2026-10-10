import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Field, Row, Screen, SectionTitle } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { nearestStores } from '@/lib/api';
import { afterWalletChange } from '@/lib/bootstrap';
import { formatPlDate, parsePlDate } from '@/lib/dates';
import { getCoupon, insertCoupon, updateCoupon, type CouponInput } from '@/lib/db/coupons';
import { getDb } from '@/lib/db';
import { getStore, recentStores, storeAddress, storeFromNearest, storeLabel, upsertStore, type CachedStore } from '@/lib/db/stores';
import { takeDraft } from '@/lib/draft';
import { distanceMeters, formatDistance, type LatLon } from '@/lib/geo';
import { getPosition } from '@/lib/location';
import { groszeToInput, parseZlotyInput } from '@/lib/money';
import { requestNotificationPermission } from '@/lib/notifications/setup';

type StoreOption = CachedStore & { distance: number | null };

/** Preselect only when we are confident: same chain nearby, or standing right at the store. */
function suggestStore(options: StoreOption[], brand: string | null): StoreOption | null {
  const sameBrand = brand ? options.find((s) => s.brand?.toLowerCase() === brand.toLowerCase()) : undefined;
  if (sameBrand) return sameBrand;
  const nearest = options[0];
  return nearest && nearest.distance !== null && nearest.distance <= 150 ? nearest : null;
}

export default function EditCouponScreen() {
  const router = useRouter();
  const theme = useTheme();
  const params = useLocalSearchParams<{ id?: string }>();
  const editingId = params.id ?? null;
  const [draft] = useState(() => (editingId ? null : takeDraft()));
  const couponId = editingId ?? draft?.id ?? null;

  const [amount, setAmount] = useState(draft?.scan?.amountGrosze ? groszeToInput(draft.scan.amountGrosze) : '');
  const [issued, setIssued] = useState(draft?.scan?.issuedOn ? formatPlDate(draft.scan.issuedOn) : '');
  const [expires, setExpires] = useState(draft?.scan?.expiresOn ? formatPlDate(draft.scan.expiresOn) : '');
  const [barcode, setBarcode] = useState(draft?.scan?.barcode ?? '');
  const [barcodeType, setBarcodeType] = useState<string | null>(draft?.scan?.barcodeType ?? null);
  const [note, setNote] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(draft?.photoUri ?? null);
  const [store, setStore] = useState<CachedStore | null>(null);
  const [options, setOptions] = useState<StoreOption[]>([]);
  const [loadingStores, setLoadingStores] = useState(true);
  const [storesError, setStoresError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  // existing coupon
  useEffect(() => {
    if (!editingId) return;
    (async () => {
      const c = await getCoupon(await getDb(), editingId);
      if (!c) return;
      setAmount(groszeToInput(c.amountGrosze));
      setIssued(c.issuedOn ? formatPlDate(c.issuedOn) : '');
      setExpires(c.expiresOn ? formatPlDate(c.expiresOn) : '');
      setBarcode(c.barcode ?? '');
      setBarcodeType(c.barcodeType);
      setNote(c.note ?? '');
      setPhotoUri(c.photoUri);
      setStore(c.store);
    })();
  }, [editingId]);

  // store candidates: nearest (server) + recently used (offline)
  useEffect(() => {
    let alive = true;
    (async () => {
      const db = await getDb();
      const recent = await recentStores(db);
      const hinted = draft?.storeIdHint ? await getStore(db, draft.storeIdHint) : null;
      let here: LatLon | null = null;
      let nearby: StoreOption[] = [];
      try {
        here = await getPosition();
        nearby = (await nearestStores(here, 400, 8)).map((s) => ({ ...storeFromNearest(s), distance: s.distance_m }));
      } catch (e) {
        if (alive) setStoresError((e as Error).message === 'permission' ? 'Bez dostępu do lokalizacji pokazujemy tylko ostatnio używane sklepy.' : 'Nie udało się pobrać sklepów w pobliżu.');
      }
      const seen = new Set(nearby.map((s) => s.id));
      const merged = [
        ...nearby,
        ...recent.filter((s) => !seen.has(s.id)).map((s) => ({ ...s, distance: here ? distanceMeters(here, s) : null })),
      ];
      if (!alive) return;
      setOptions(merged);
      setLoadingStores(false);
      if (!editingId) setStore((current) => current ?? hinted ?? suggestStore(merged, draft?.scan?.brand ?? null));
    })();
    return () => {
      alive = false;
    };
  }, [draft, editingId]);

  const parsed = useMemo(() => {
    const amountGrosze = parseZlotyInput(amount);
    const issuedOn = issued.trim() ? parsePlDate(issued) : null;
    const expiresOn = expires.trim() ? parsePlDate(expires) : null;
    return {
      amountGrosze,
      issuedOn,
      expiresOn,
      errors: {
        amount: amountGrosze === null || amountGrosze === 0 ? 'Podaj kwotę z kuponu, np. 3,50' : null,
        issued: issued.trim() && !issuedOn ? 'Data w formacie DD.MM.RRRR' : null,
        expires:
          expires.trim() && !expiresOn
            ? 'Data w formacie DD.MM.RRRR'
            : issuedOn && expiresOn && expiresOn < issuedOn
              ? 'Data ważności jest wcześniejsza niż data wydania'
              : null,
      },
    };
  }, [amount, issued, expires]);

  const valid = !parsed.errors.amount && !parsed.errors.issued && !parsed.errors.expires;

  const save = async () => {
    setSubmitted(true);
    if (!valid || !couponId) return;
    setSaving(true);
    try {
      const db = await getDb();
      if (store) await upsertStore(db, store);
      const input: CouponInput = {
        amountGrosze: parsed.amountGrosze!,
        issuedOn: parsed.issuedOn,
        expiresOn: parsed.expiresOn,
        barcode: barcode.trim() || null,
        barcodeType: barcode.trim() ? barcodeType : null,
        storeId: store?.id ?? null,
        note: note.trim() || null,
        photoUri,
        ocrText: draft?.scan?.text ?? null,
      };
      if (editingId) await updateCoupon(db, editingId, input);
      else await insertCoupon(db, couponId, input);
      if (input.expiresOn) await requestNotificationPermission().catch(() => false);
      await afterWalletChange();
      if (editingId) router.back();
      else router.dismissTo('/');
    } catch (e) {
      console.warn('[coupon save]', e);
      Alert.alert('Nie udało się zapisać kuponu', 'Spróbuj ponownie.');
      setSaving(false);
    }
  };

  const scanFound = draft?.scan && (draft.scan.amountGrosze || draft.scan.expiresOn || draft.scan.barcode);

  return (
    <Screen>
      {draft?.scan ? (
        <Card>
          <ThemedText type="smallBold">{scanFound ? 'Sprawdź odczytane dane' : 'Nie udało się odczytać kuponu'}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {scanFound ? 'Popraw pola, jeśli coś się nie zgadza.' : 'Uzupełnij pola ręcznie. Zdjęcie zostanie zapisane przy kuponie.'}
          </ThemedText>
        </Card>
      ) : null}

      {photoUri ? <Image source={{ uri: photoUri }} style={styles.photo} contentFit="contain" accessibilityLabel="Zdjęcie kuponu" /> : null}

      <Field
        label="Kwota (zł)"
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        placeholder="3,50"
        error={submitted ? parsed.errors.amount : null}
      />
      <Row style={{ alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Field label="Data wydania" value={issued} onChangeText={setIssued} placeholder="DD.MM.RRRR" keyboardType="numbers-and-punctuation" error={submitted ? parsed.errors.issued : null} />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Ważny do" value={expires} onChangeText={setExpires} placeholder="DD.MM.RRRR" keyboardType="numbers-and-punctuation" error={submitted ? parsed.errors.expires : null} hint="Ostatni dzień ważności" />
        </View>
      </Row>
      <Field label="Kod kreskowy" value={barcode} onChangeText={setBarcode} placeholder="np. 5901234123457" keyboardType="number-pad" hint={barcodeType ? `Odczytano: ${barcodeType}` : undefined} />

      <SectionTitle>Sklep</SectionTitle>
      {loadingStores ? <ActivityIndicator /> : null}
      {storesError ? (
        <ThemedText type="small" themeColor="textSecondary">
          {storesError}
        </ThemedText>
      ) : null}
      {store && !options.some((o) => o.id === store.id) ? <StoreRow store={store} distance={null} selected onPress={() => setStore(null)} /> : null}
      {options.map((o) => (
        <StoreRow key={o.id} store={o} distance={o.distance} selected={store?.id === o.id} onPress={() => setStore(store?.id === o.id ? null : o)} />
      ))}
      {!loadingStores && options.length === 0 && !store ? (
        <ThemedText type="small" themeColor="textSecondary">
          Brak sklepów w pobliżu. Kupon zapiszesz bez sklepu i przypiszesz go później.
        </ThemedText>
      ) : null}

      <Field label="Notatka (opcjonalnie)" value={note} onChangeText={setNote} placeholder="np. butelki z imprezy" maxLength={500} />

      <Button title={editingId ? 'Zapisz zmiany' : 'Zapisz kupon'} onPress={save} loading={saving} />
      <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
        Kupon zapisujemy tylko na tym telefonie{' '}— chyba że włączysz kopię zapasową.
      </ThemedText>
      <View style={{ height: Spacing.two, backgroundColor: theme.background }} />
    </Screen>
  );
}

function StoreRow({ store, distance, selected, onPress }: { store: CachedStore; distance: number | null; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  const address = storeAddress(store);
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.storeRow, { borderColor: selected ? theme.tint : theme.border, backgroundColor: theme.card }]}>
      <View style={{ flex: 1 }}>
        <ThemedText type="smallBold">{storeLabel(store)}</ThemedText>
        {address ? (
          <ThemedText type="small" themeColor="textSecondary">
            {address}
          </ThemedText>
        ) : null}
      </View>
      {distance !== null ? (
        <ThemedText type="small" themeColor="textSecondary">
          {formatDistance(distance)}
        </ThemedText>
      ) : null}
      <ThemedText style={{ color: selected ? theme.tint : theme.border }}>{selected ? '●' : '○'}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  photo: { width: '100%', height: 220, borderRadius: Radius.medium, backgroundColor: '#0001' },
  storeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.medium,
    borderWidth: 1.5,
  },
});
