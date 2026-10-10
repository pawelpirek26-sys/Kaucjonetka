// Report how a machine works. The server checks the 200 m radius and the hourly limit;
// the location is sent once with the report and not stored beyond the distance.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Screen, StatusDot } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { machineById, reportMachine, storesByIds, toApiError, type MachineLive, type ReportType } from '@/lib/api';
import { useSession } from '@/lib/auth';
import { getPosition, LocationUnavailableError } from '@/lib/location';
import { REPORT_LABELS, REPORT_TYPES, reportLevel, STATUS_COLORS, STATUS_LABELS } from '@/lib/status';

export default function ReportScreen() {
  const router = useRouter();
  const theme = useTheme();
  const session = useSession();
  const { machineId } = useLocalSearchParams<{ machineId: string }>();
  const [machine, setMachine] = useState<MachineLive | null>(null);
  const [place, setPlace] = useState<string | null>(null);
  const [busy, setBusy] = useState<ReportType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<ReportType | null>(null);

  useEffect(() => {
    machineById(Number(machineId))
      .then(async (m) => {
        setMachine(m);
        if (m?.store_id) {
          const [s] = await storesByIds([m.store_id]);
          setPlace(s?.name ?? s?.brand ?? null);
        }
      })
      .catch((e) => setError(toApiError(e).message));
  }, [machineId]);

  const send = async (type: ReportType) => {
    setBusy(type);
    setError(null);
    try {
      const position = await getPosition({ precise: true });
      await reportMachine(Number(machineId), type, position);
      setDone(type);
    } catch (e) {
      setError(
        e instanceof LocationUnavailableError
          ? 'Włącz lokalizację: zgłoszenia przyjmujemy tylko sprzed automatu (do 200 m).'
          : toApiError(e).message,
      );
    } finally {
      setBusy(null);
    }
  };

  if (!session) {
    return (
      <Screen>
        <ThemedText>Zgłaszanie wymaga zalogowania, żeby chronić mapę przed spamem.</ThemedText>
        <Button title="Zaloguj się" onPress={() => router.push('/sign-in')} />
        <Button title="Anuluj" variant="ghost" onPress={() => router.back()} />
      </Screen>
    );
  }

  if (done) {
    return (
      <Screen>
        <Card style={{ alignItems: 'center' }}>
          <ThemedText type="subtitle">Dziękujemy!</ThemedText>
          <ThemedText style={{ textAlign: 'center' }}>
            Zapisaliśmy: {REPORT_LABELS[done]}. Inni zobaczą status na mapie przez najbliższe 6 godzin.
          </ThemedText>
        </Card>
        {machine?.store_id ? <Button title="Zeskanuj kupon" onPress={() => router.replace(`/coupon/new?storeId=${machine.store_id}`)} /> : null}
        <Button title="Gotowe" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ThemedText type="subtitle">{place ?? machine?.name ?? 'Automat kaucyjny'}</ThemedText>
      {machine ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
          <StatusDot color={STATUS_COLORS[machine.status ?? 'unknown']} />
          <ThemedText type="small" themeColor="textSecondary">
            Teraz: {STATUS_LABELS[machine.status ?? 'unknown']}
          </ThemedText>
        </View>
      ) : null}
      <ThemedText themeColor="textSecondary">Jak działa automat?</ThemedText>
      {REPORT_TYPES.map((type) => {
        const color = STATUS_COLORS[reportLevel(type)];
        return (
          <Pressable
            key={type}
            accessibilityRole="button"
            accessibilityLabel={REPORT_LABELS[type]}
            disabled={busy !== null}
            onPress={() => send(type)}
            style={({ pressed }) => [styles.option, { borderColor: color, backgroundColor: theme.card, opacity: busy && busy !== type ? 0.5 : pressed ? 0.8 : 1 }]}>
            <StatusDot color={color} size={16} />
            <ThemedText style={{ flex: 1 }}>{REPORT_LABELS[type]}</ThemedText>
            {busy === type ? <ThemedText type="small">Wysyłam…</ThemedText> : null}
          </Pressable>
        );
      })}
      {error ? (
        <Card>
          <ThemedText style={{ color: theme.danger }}>{error}</ThemedText>
        </Card>
      ) : null}
      <ThemedText type="small" themeColor="textSecondary">
        Twoja lokalizacja służy tylko do sprawdzenia, czy jesteś przy automacie (do 200 m). Limit: 10 zgłoszeń na godzinę.
      </ThemedText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.medium,
    borderWidth: 2,
    minHeight: 56,
  },
});
