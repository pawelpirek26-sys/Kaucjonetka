import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Linking, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, Row, Screen, SectionTitle, SwitchRow } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { signOut, useSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { DWELL_OPTIONS_S, getSettings, RADIUS_OPTIONS_M, updateSettings, type Settings } from '@/lib/db/settings';
import { disableGeofencing, refreshGeofences, type GeofenceStatus } from '@/lib/geofence/manager';
import { rescheduleExpiryReminders } from '@/lib/notifications/schedule';
import { requestNotificationPermission } from '@/lib/notifications/setup';
import { supabase } from '@/lib/supabase/client';
import { disableBackup, enableBackup, syncBackup } from '@/lib/sync/backup';

const QUIET_STARTS = ['21:00', '22:00', '23:00'];
const QUIET_ENDS = ['06:00', '07:00', '08:00'];

function geofenceStatusText(s: GeofenceStatus | null): string | null {
  if (!s) return null;
  switch (s.state) {
    case 'monitoring':
      return `Obserwuję ${s.storeCount} ${s.storeCount === 1 ? 'sklep' : s.storeCount < 5 ? 'sklepy' : 'sklepów'} z Twoimi kuponami.`;
    case 'idle':
      return 'Włączone. Dodaj kupon z przypisanym sklepem, żeby zacząć.';
    case 'no_permission':
      return 'Brak zgody na lokalizację w tle. Funkcja została wyłączona.';
    default:
      return null;
  }
}

export default function SettingsScreen() {
  const router = useRouter();
  const session = useSession();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [geoStatus, setGeoStatus] = useState<GeofenceStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const db = await getDb();
    setSettings(await getSettings(db));
    setGeoStatus(await refreshGeofences().catch(() => null));
    setSettings(await getSettings(db));
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const patch = async (p: Partial<Settings>) => {
    const next = await updateSettings(await getDb(), p);
    setSettings(next);
    return next;
  };

  const run = async (key: string, job: () => Promise<unknown>, errorTitle: string) => {
    setBusy(key);
    try {
      await job();
    } catch (e) {
      Alert.alert(errorTitle, (e as Error).message);
    } finally {
      setBusy(null);
      reload();
    }
  };

  if (!settings) return null;

  return (
    <Screen edges={['top', 'bottom']}>
      <ThemedText type="title">Ustawienia</ThemedText>

      <SectionTitle>Przypomnienia przy sklepie</SectionTitle>
      <Card>
        <SwitchRow
          label="Powiadom, gdy jestem w sklepie z kuponami"
          description="Działa w tle tylko po Twojej zgodzie. Lokalizacja nie opuszcza telefonu."
          value={settings.geofencingEnabled}
          onValueChange={(on) => (on ? router.push('/location-permission') : run('geo', disableGeofencing, 'Nie udało się wyłączyć'))}
        />
        {geofenceStatusText(geoStatus) ? (
          <ThemedText type="small" themeColor="textSecondary">
            {geofenceStatusText(geoStatus)}
          </ThemedText>
        ) : null}
        {settings.geofencingEnabled ? (
          <View style={{ gap: Spacing.two }}>
            <ThemedText type="smallBold">Promień wokół sklepu</ThemedText>
            <Row style={{ flexWrap: 'wrap' }}>
              {RADIUS_OPTIONS_M.map((r) => (
                <Chip key={r} label={`${r} m`} selected={settings.radiusM === r} onPress={() => patch({ radiusM: r }).then(reload)} />
              ))}
            </Row>
            <ThemedText type="smallBold">Powiadom po</ThemedText>
            <Row style={{ flexWrap: 'wrap' }}>
              {DWELL_OPTIONS_S.map((s) => (
                <Chip key={s} label={s < 120 ? `${s} s` : `${s / 60} min`} selected={settings.dwellSeconds === s} onPress={() => patch({ dwellSeconds: s })} />
              ))}
            </Row>
            <ThemedText type="small" themeColor="textSecondary">
              Krótkie przejście obok sklepu nie wywoła powiadomienia. Ten sam sklep przypominamy najwyżej raz na 12 godzin.
            </ThemedText>
          </View>
        ) : null}
      </Card>

      <Card>
        <SwitchRow
          label="Godziny ciszy"
          description={`Bez powiadomień przy sklepie od ${settings.quietHours.start} do ${settings.quietHours.end}`}
          value={settings.quietHours.enabled}
          onValueChange={(enabled) => patch({ quietHours: { ...settings.quietHours, enabled } })}
        />
        {settings.quietHours.enabled ? (
          <>
            <ThemedText type="smallBold">Od</ThemedText>
            <Row>
              {QUIET_STARTS.map((t) => (
                <Chip key={t} label={t} selected={settings.quietHours.start === t} onPress={() => patch({ quietHours: { ...settings.quietHours, start: t } })} />
              ))}
            </Row>
            <ThemedText type="smallBold">Do</ThemedText>
            <Row>
              {QUIET_ENDS.map((t) => (
                <Chip key={t} label={t} selected={settings.quietHours.end === t} onPress={() => patch({ quietHours: { ...settings.quietHours, end: t } })} />
              ))}
            </Row>
          </>
        ) : null}
      </Card>

      <SectionTitle>Ważność kuponów</SectionTitle>
      <Card>
        <SwitchRow
          label="Przypomnij przed końcem ważności"
          description="3 dni i 1 dzień przed ostatnim dniem ważności, o 10:00."
          value={settings.expiryRemindersEnabled}
          onValueChange={async (on) => {
            if (on) await requestNotificationPermission();
            await patch({ expiryRemindersEnabled: on });
            await rescheduleExpiryReminders();
          }}
        />
      </Card>

      <SectionTitle>Konto i kopia zapasowa</SectionTitle>
      <Card>
        {!supabase ? (
          <ThemedText type="small" themeColor="textSecondary">
            Ta wersja aplikacji nie ma skonfigurowanego serwera. Portfel działa lokalnie.
          </ThemedText>
        ) : session ? (
          <>
            <ThemedText>Zalogowano: {session.user.email ?? 'konto'}</ThemedText>
            <SwitchRow
              label="Kopia zapasowa kuponów"
              description="Kupony i zdjęcia trafiają na Twoje prywatne konto. Wyłączone = dane tylko na telefonie."
              value={settings.backupEnabled}
              disabled={busy === 'backup'}
              onValueChange={(on) =>
                on
                  ? run('backup', enableBackup, 'Nie udało się włączyć kopii')
                  : Alert.alert('Wyłączyć kopię zapasową?', 'Możesz też usunąć kopię z serwera.', [
                      { text: 'Anuluj', style: 'cancel' },
                      { text: 'Wyłącz', onPress: () => run('backup', () => disableBackup({ deleteRemote: false }), 'Błąd') },
                      { text: 'Wyłącz i usuń z serwera', style: 'destructive', onPress: () => run('backup', () => disableBackup({ deleteRemote: true }), 'Błąd') },
                    ])
              }
            />
            {settings.backupEnabled ? (
              <Button title="Synchronizuj teraz" variant="secondary" loading={busy === 'sync'} onPress={() => run('sync', syncBackup, 'Synchronizacja nie powiodła się')} />
            ) : null}
            <Button title="Wyloguj" variant="ghost" onPress={() => run('signout', signOut, 'Błąd')} />
          </>
        ) : (
          <>
            <ThemedText type="small" themeColor="textSecondary">
              Logowanie jest potrzebne do zgłaszania stanu automatów i do kopii zapasowej. Portfel działa bez konta.
            </ThemedText>
            <Button title="Zaloguj się" onPress={() => router.push('/sign-in')} />
          </>
        )}
      </Card>

      <SectionTitle>Dane i licencje</SectionTitle>
      <Card>
        <ThemedText type="small">
          Sklepy i automaty: © współtwórcy OpenStreetMap, licencja ODbL. Mapa: OpenFreeMap, © OpenMapTiles.
        </ThemedText>
        <Row style={{ flexWrap: 'wrap' }}>
          <Button title="OpenStreetMap — prawa autorskie" variant="ghost" onPress={() => Linking.openURL('https://www.openstreetmap.org/copyright')} />
          <Button title="Popraw dane w OSM" variant="ghost" onPress={() => Linking.openURL('https://www.openstreetmap.org/fixthemap')} />
        </Row>
      </Card>
    </Screen>
  );
}
