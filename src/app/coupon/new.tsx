import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Crypto from 'expo-crypto';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Button, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { setDraft } from '@/lib/draft';
import { COUPON_BARCODE_TYPES, scanCouponPhoto } from '@/lib/ocr/recognize';
import { resolvePhotoUri, storeCouponPhoto } from '@/lib/photos';

export default function NewCouponScreen() {
  const router = useRouter();
  const { storeId } = useLocalSearchParams<{ storeId?: string }>();
  const storeIdHint = storeId ? Number(storeId) : null;
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const liveBarcode = useRef<{ data: string; type: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const manual = () => {
    const id = Crypto.randomUUID();
    setDraft({ id, photoUri: null, scan: null, storeIdHint });
    router.replace({ pathname: '/coupon/edit', params: { draft: id } });
  };

  if (!permission) return <View style={{ flex: 1 }} />;

  if (!permission.granted) {
    return (
      <Screen edges={['top', 'bottom']}>
        <ThemedText type="subtitle">Zrób zdjęcie kuponu</ThemedText>
        <ThemedText themeColor="textSecondary">
          Aparat odczyta kwotę, daty i kod kreskowy. Zdjęcie zostaje na telefonie, a tekst rozpoznajemy na urządzeniu.
        </ThemedText>
        {permission.canAskAgain ? (
          <Button title="Zezwól na aparat" onPress={requestPermission} />
        ) : (
          <Button title="Otwórz ustawienia" onPress={() => Linking.openSettings()} />
        )}
        <Button title="Wpisz ręcznie" variant="secondary" onPress={manual} />
        <Button title="Anuluj" variant="ghost" onPress={() => router.back()} />
      </Screen>
    );
  }

  const onBarcode = (result: BarcodeScanningResult) => {
    liveBarcode.current = { data: result.data, type: result.type };
  };

  const capture = async () => {
    if (!camera.current || busy) return;
    setBusy(true);
    setError(null);
    try {
      const photo = await camera.current.takePictureAsync({ quality: 0.85 });
      const id = Crypto.randomUUID();
      const photoUri = await storeCouponPhoto(photo.uri, id);
      const scan = await scanCouponPhoto(resolvePhotoUri(photoUri) ?? photo.uri, liveBarcode.current);
      setDraft({ id, photoUri, scan, storeIdHint });
      router.replace({ pathname: '/coupon/edit', params: { draft: id } });
    } catch (e) {
      console.warn('[camera]', e);
      setError('Nie udało się zrobić zdjęcia. Spróbuj ponownie albo wpisz dane ręcznie.');
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <CameraView
        ref={camera}
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: COUPON_BARCODE_TYPES }}
        onBarcodeScanned={onBarcode}
      />
      <SafeAreaView style={styles.overlay} edges={['top', 'bottom']}>
        <View style={styles.topBar}>
          <Button title="Zamknij" variant="secondary" onPress={() => router.back()} />
          <Button title="Wpisz ręcznie" variant="secondary" onPress={manual} />
        </View>
        <View style={styles.frame} pointerEvents="none" />
        <View style={styles.bottom}>
          <ThemedText style={styles.hint}>
            {error ?? 'Ułóż cały kupon w ramce, razem z kodem kreskowym.'}
          </ThemedText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Zrób zdjęcie kuponu"
            onPress={capture}
            disabled={busy}
            style={({ pressed }) => [styles.shutter, { opacity: pressed || busy ? 0.6 : 1 }]}>
            {busy ? <ActivityIndicator color="#11181C" /> : null}
          </Pressable>
          {busy ? <ThemedText style={styles.hint}>Odczytuję kupon…</ThemedText> : null}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  overlay: { flex: 1, justifyContent: 'space-between', padding: Spacing.three },
  topBar: { flexDirection: 'row', justifyContent: 'space-between' },
  frame: {
    flex: 1,
    marginVertical: Spacing.four,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.8)',
    borderRadius: 16,
  },
  bottom: { alignItems: 'center', gap: Spacing.three },
  hint: { color: '#fff', textAlign: 'center' },
  shutter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#fff',
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
