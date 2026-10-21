import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, EmptyState, Row, Screen } from '@/components/ui';
import { Fonts, Radius } from '@/constants/theme';
import { useQuery } from '@/hooks/use-query';
import { useTheme } from '@/hooks/use-theme';
import { afterWalletChange } from '@/lib/bootstrap';
import { formatPlDate, toISODate } from '@/lib/dates';
import { deleteCoupon, effectiveStatus, getCoupon, setCouponStatus, type CouponStatus } from '@/lib/db/coupons';
import { getDb } from '@/lib/db';
import { storeAddress, storeLabel } from '@/lib/db/stores';
import { useWalletRevision } from '@/lib/events';
import { formatGrosze } from '@/lib/money';
import { deleteCouponPhoto, resolvePhotoUri } from '@/lib/photos';
import { remotePhotoUrl } from '@/lib/sync/backup';

const STATUS_LABEL: Record<CouponStatus, string> = { active: 'Aktywny', redeemed: 'Wykorzystany', expired: 'Wygasły' };

export default function CouponScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const revision = useWalletRevision();
  const { data } = useQuery(async () => {
    const c = await getCoupon(await getDb(), id);
    const photo = resolvePhotoUri(c?.photoUri ?? null) ?? (c?.photoPath ? await remotePhotoUrl(c.photoPath) : null);
    return { coupon: c, photo };
  }, [id, revision]);
  const coupon = data?.coupon;
  const photo = data?.photo ?? null;

  if (coupon === undefined) return null;
  if (coupon === null) {
    return (
      <Screen>
        <EmptyState title="Nie ma takiego kuponu" />
      </Screen>
    );
  }

  const status = effectiveStatus(coupon, toISODate(new Date()));

  const changeStatus = async (next: CouponStatus) => {
    await setCouponStatus(await getDb(), coupon.id, next);
    await afterWalletChange();
    if (next === 'redeemed') router.back();
  };

  const remove = () =>
    Alert.alert('Usunąć kupon?', 'Tej operacji nie można cofnąć.', [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Usuń',
        style: 'destructive',
        onPress: async () => {
          await deleteCoupon(await getDb(), coupon.id);
          deleteCouponPhoto(coupon.photoUri);
          await afterWalletChange();
          router.back();
        },
      },
    ]);

  return (
    <Screen>
      <Card style={{ alignItems: 'center' }}>
        <ThemedText type="title">{formatGrosze(coupon.amountGrosze)}</ThemedText>
        <Chip label={STATUS_LABEL[status]} selected color={status === 'active' ? theme.tint : status === 'redeemed' ? theme.textSecondary : theme.danger} />
        {coupon.store ? (
          <>
            <ThemedText type="smallBold">{storeLabel(coupon.store)}</ThemedText>
            {storeAddress(coupon.store) ? (
              <ThemedText type="small" themeColor="textSecondary">
                {storeAddress(coupon.store)}
              </ThemedText>
            ) : null}
          </>
        ) : null}
        <ThemedText type="small" themeColor="textSecondary">
          {[coupon.issuedOn ? `wydany ${formatPlDate(coupon.issuedOn)}` : null, coupon.expiresOn ? `ważny do ${formatPlDate(coupon.expiresOn)}` : null]
            .filter(Boolean)
            .join(' · ') || 'bez dat'}
        </ThemedText>
      </Card>

      {coupon.barcode ? (
        <Card style={{ alignItems: 'center' }}>
          <ThemedText type="small" themeColor="textSecondary">
            Kod dla kasjera
          </ThemedText>
          <ThemedText selectable style={styles.code} accessibilityLabel={`Kod ${coupon.barcode.split('').join(' ')}`}>
            {coupon.barcode}
          </ThemedText>
        </Card>
      ) : null}

      {photo ? (
        <Image source={{ uri: photo }} style={styles.photo} contentFit="contain" accessibilityLabel="Zdjęcie kuponu: pokaż je przy kasie, kod można zeskanować z ekranu" />
      ) : null}

      {coupon.note ? <ThemedText themeColor="textSecondary">{coupon.note}</ThemedText> : null}

      {status === 'active' ? <Button title="Oznacz jako wykorzystany" onPress={() => changeStatus('redeemed')} /> : null}
      {status === 'redeemed' ? <Button title="Przywróć do aktywnych" variant="secondary" onPress={() => changeStatus('active')} /> : null}
      {status === 'expired' ? (
        <ThemedText type="small" themeColor="textSecondary">
          Termin ważności minął. Jeśli data jest odczytana błędnie, popraw ją w edycji.
        </ThemedText>
      ) : null}
      <Row>
        <Button style={{ flex: 1 }} title="Edytuj" variant="secondary" onPress={() => router.push(`/coupon/edit?id=${coupon.id}`)} />
        <Button style={{ flex: 1 }} title="Usuń" variant="danger" onPress={remove} />
      </Row>
    </Screen>
  );
}

const styles = StyleSheet.create({
  code: { fontFamily: Fonts.mono, fontSize: 24, letterSpacing: 2 },
  photo: { width: '100%', height: 420, borderRadius: Radius.medium },
});
