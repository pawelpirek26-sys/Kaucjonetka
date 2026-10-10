// Explanation shown before asking for background ("Always") location. The feature is
// opt-in; declining keeps the rest of the app fully working.
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { getDb } from '@/lib/db';
import { updateSettings } from '@/lib/db/settings';
import { refreshGeofences } from '@/lib/geofence/manager';
import { requestNotificationPermission } from '@/lib/notifications/setup';

const POINTS = [
  'Gdy wejdziesz do sklepu, w którym masz kupony, i zostaniesz w nim chwilę, przypomnimy Ci o nich: ile ich jest i na jaką kwotę.',
  'Po wyjściu ze sklepu z automatem zapytamy, czy zeskanować nowy kupon i jak działał automat.',
  'Telefon sam pilnuje maksymalnie 20 najbliższych sklepów z Twoimi kuponami (system geofencingu). Aplikacja nie śledzi trasy i oszczędza baterię.',
  'Twoja lokalizacja nie jest nigdzie wysyłana ani zapisywana na serwerze.',
  'W każdej chwili wyłączysz to w Ustawieniach.',
];

export default function LocationPermissionScreen() {
  const router = useRouter();
  const [step, setStep] = useState<'intro' | 'denied'>('intro');
  const [busy, setBusy] = useState(false);

  const enable = async () => {
    setBusy(true);
    try {
      const fg = await Location.requestForegroundPermissionsAsync();
      if (!fg.granted) return setStep('denied');
      const bg = await Location.requestBackgroundPermissionsAsync();
      if (!bg.granted) return setStep('denied');
      await requestNotificationPermission();
      await updateSettings(await getDb(), { geofencingEnabled: true });
      await refreshGeofences();
      router.back();
    } finally {
      setBusy(false);
    }
  };

  if (step === 'denied') {
    return (
      <Screen>
        <ThemedText type="subtitle">Bez zgody na lokalizację w tle</ThemedText>
        <ThemedText themeColor="textSecondary">
          Przypomnienia przy sklepie wymagają ustawienia {Platform.OS === 'ios' ? '„Zawsze”' : '„Zezwalaj zawsze”'} dla lokalizacji. Możesz to zmienić w
          ustawieniach systemu. Reszta aplikacji działa bez tej zgody.
        </ThemedText>
        <Button title="Otwórz ustawienia systemu" onPress={() => Linking.openSettings()} />
        <Button title="Nie teraz" variant="ghost" onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ThemedText type="subtitle">Przypomnimy o kuponach w sklepie</ThemedText>
      <Card>
        {POINTS.map((p) => (
          <View key={p} style={{ flexDirection: 'row', gap: Spacing.two }}>
            <ThemedText>•</ThemedText>
            <ThemedText style={{ flex: 1 }}>{p}</ThemedText>
          </View>
        ))}
      </Card>
      <ThemedText type="small" themeColor="textSecondary">
        Za chwilę system zapyta o dostęp do lokalizacji. Wybierz {Platform.OS === 'ios' ? '„Podczas używania”, a potem „Zawsze”' : '„Podczas używania aplikacji”, a następnie „Zezwalaj zawsze”'}.
      </ThemedText>
      <Button title="Włącz przypomnienia" onPress={enable} loading={busy} />
      <Button title="Nie teraz" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
