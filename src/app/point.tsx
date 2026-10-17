import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, EmptyState, Row, Screen, StatusDot } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import {
  machineById,
  machinesAtStore,
  pendingMachineConfirmations,
  storesByIds,
  submitMissingMachine,
  toApiError,
  voteReport,
  type MachineLive,
  type StoreById,
} from '@/lib/api';
import { useSession } from '@/lib/auth';
import { couponsAtStore } from '@/lib/db/coupons';
import { getDb } from '@/lib/db';
import { storeAddress } from '@/lib/db/stores';
import { distanceMeters, formatDistance, type LatLon } from '@/lib/geo';
import { getPosition, LocationUnavailableError } from '@/lib/location';
import { formatGrosze } from '@/lib/money';
import { openNavigation } from '@/lib/navigation';
import { countCoupons } from '@/lib/i18n';
import { PACKAGING_LABELS, REPORT_LABELS, STATUS_COLORS, STATUS_LABELS, STILL_QUESTIONS, timeAgo } from '@/lib/status';

function errorText(e: unknown): string {
  if (e instanceof LocationUnavailableError) return 'Włącz lokalizację: potwierdzenia przyjmujemy tylko sprzed automatu (do 200 m).';
  return toApiError(e).message;
}

export default function PointScreen() {
  const router = useRouter();
  const session = useSession();
  const params = useLocalSearchParams<{ storeId?: string; machineId?: string }>();
  const storeId = params.storeId ? Number(params.storeId) : null;
  const machineId = params.machineId ? Number(params.machineId) : null;

  const [store, setStore] = useState<StoreById | null>(null);
  const [machines, setMachines] = useState<MachineLive[]>([]);
  const [mine, setMine] = useState<{ count: number; sumGrosze: number } | null>(null);
  const [pending, setPending] = useState<{ users: number; mine: boolean } | null>(null);
  const [me, setMe] = useState<LatLon | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      if (storeId) {
        const [stores, list] = await Promise.all([storesByIds([storeId]), machinesAtStore(storeId)]);
        setStore(stores[0] ?? null);
        setMachines(list);
        setMine(await couponsAtStore(await getDb(), storeId));
        setPending(list.length === 0 ? await pendingMachineConfirmations(storeId) : null);
      } else if (machineId) {
        const m = await machineById(machineId);
        setMachines(m ? [m] : []);
      }
      setState('ready');
    } catch {
      setState('error');
    }
    getPosition().then(setMe).catch(() => undefined);
  }, [storeId, machineId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const target = store ? { lat: store.lat, lon: store.lon } : machines[0] ? { lat: machines[0].lat!, lon: machines[0].lon! } : null;
  const title = store?.name ?? store?.brand ?? machines[0]?.name ?? 'Automat kaucyjny';

  const requireSession = () => {
    if (session) return true;
    Alert.alert('Zaloguj się', 'Potwierdzenia i zgłoszenia wymagają konta (ochrona przed spamem).', [
      { text: 'Anuluj', style: 'cancel' },
      { text: 'Zaloguj', onPress: () => router.push('/sign-in') },
    ]);
    return false;
  };

  const vote = async (m: MachineLive, still: boolean) => {
    if (!m.report_id || !requireSession()) return;
    setBusy(`vote-${m.id}`);
    try {
      await voteReport(m.report_id, still, await getPosition({ precise: true }));
      setNotice('Dziękujemy za potwierdzenie!');
      await load();
    } catch (e) {
      Alert.alert('Nie udało się', errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const addMachine = async () => {
    if (!storeId || !requireSession()) return;
    setBusy('add');
    try {
      const result = await submitMissingMachine(storeId, await getPosition({ precise: true }), [], null);
      if (result.status === 'approved') {
        setNotice('Dziękujemy! Automat jest już na mapie. Możesz od razu zgłosić, jak działa.');
      } else {
        setNotice('Dziękujemy! Automat pojawi się na mapie, gdy potwierdzi go druga osoba.');
      }
      await load();
    } catch (e) {
      Alert.alert('Nie udało się', errorText(e));
    } finally {
      setBusy(null);
    }
  };

  if (state === 'loading') return <ActivityIndicator style={{ marginTop: Spacing.five }} />;
  if (state === 'error' || (!store && machines.length === 0)) {
    return (
      <Screen>
        <EmptyState title="Nie udało się wczytać punktu" description="Sprawdź połączenie z internetem.">
          <Button title="Spróbuj ponownie" onPress={load} />
        </EmptyState>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ gap: Spacing.one }}>
        <ThemedText type="subtitle">{title}</ThemedText>
        {store && storeAddress(store) ? <ThemedText themeColor="textSecondary">{storeAddress(store)}</ThemedText> : null}
        {me && target ? (
          <ThemedText type="small" themeColor="textSecondary">
            {formatDistance(distanceMeters(me, target))} od Ciebie
          </ThemedText>
        ) : null}
      </View>

      {notice ? (
        <Card>
          <ThemedText>{notice}</ThemedText>
        </Card>
      ) : null}

      {mine && mine.count > 0 ? (
        <Card>
          <ThemedText type="smallBold">
            Masz tu {countCoupons(mine.count)} na {formatGrosze(mine.sumGrosze)}
          </ThemedText>
          <Button title="Pokaż kupony" variant="secondary" onPress={() => router.push(`/?store=${storeId}`)} />
        </Card>
      ) : null}

      {machines.map((m) => (
        <Card key={m.id}>
          <Row>
            <StatusDot color={STATUS_COLORS[m.status ?? 'unknown']} size={14} />
            <ThemedText type="smallBold">{STATUS_LABELS[m.status ?? 'unknown']}</ThemedText>
          </Row>
          {m.report_type && m.reported_at ? (
            <ThemedText type="small" themeColor="textSecondary">
              {m.is_fresh ? 'Ostatnie zgłoszenie' : 'Nieaktualne zgłoszenie'}: {REPORT_LABELS[m.report_type]} · {timeAgo(m.reported_at)}
              {m.confirmations ? ` · potwierdzeń: ${m.confirmations}` : ''}
            </ThemedText>
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              Nikt jeszcze nie zgłaszał stanu tego automatu.
            </ThemedText>
          )}
          {m.accepts && m.accepts.length > 0 ? (
            <Row style={{ flexWrap: 'wrap' }}>
              {m.accepts.map((p) => (
                <Chip key={p} label={PACKAGING_LABELS[p]} />
              ))}
            </Row>
          ) : null}
          {m.is_fresh && m.report_type && m.report_id ? (
            <View style={{ gap: Spacing.two }}>
              <ThemedText>{STILL_QUESTIONS[m.report_type]}</ThemedText>
              <Row>
                <Button style={{ flex: 1 }} title="Tak, nadal" variant="secondary" loading={busy === `vote-${m.id}`} onPress={() => vote(m, true)} />
                <Button style={{ flex: 1 }} title="Już nie" variant="secondary" disabled={busy === `vote-${m.id}`} onPress={() => vote(m, false)} />
              </Row>
            </View>
          ) : null}
          <Button title="Zgłoś stan automatu" onPress={() => (requireSession() ? router.push(`/report?machineId=${m.id}`) : undefined)} />
        </Card>
      ))}

      {store && machines.length === 0 ? (
        <Card>
          <ThemedText type="smallBold">Nie znamy tu automatu</ThemedText>
          {pending?.mine ? (
            <ThemedText type="small" themeColor="textSecondary">
              Zgłosiłeś tu automat. Pojawi się na mapie, gdy potwierdzi go druga osoba.
            </ThemedText>
          ) : (
            <>
              <ThemedText type="small" themeColor="textSecondary">
                {pending && pending.users > 0
                  ? `${pending.users === 1 ? 'Ktoś już zgłosił' : `${pending.users} osoby zgłosiły`} tu automat. Jeśli go widzisz, potwierdź: wtedy od razu trafi na mapę.`
                  : 'Jesteś w sklepie i stoi tu automat do zwrotu opakowań? Dodaj go: pojawi się na mapie, gdy potwierdzi go druga osoba.'}
              </ThemedText>
              <Button
                title={pending && pending.users > 0 ? 'Potwierdź automat w tym sklepie' : 'Dodaj automat w tym sklepie'}
                variant="secondary"
                loading={busy === 'add'}
                onPress={addMachine}
              />
            </>
          )}
        </Card>
      ) : null}

      {target ? <Button title="Nawiguj" variant="secondary" onPress={() => openNavigation(target.lat, target.lon, title)} /> : null}
      <ThemedText type="small" themeColor="textSecondary">
        Dane punktu: © współtwórcy OpenStreetMap (ODbL).
      </ThemedText>
    </Screen>
  );
}
