import { recognizeText } from '@infinitered/react-native-mlkit-text-recognition';
import { scanFromURLAsync, type BarcodeType } from 'expo-camera';

import { parseCouponText, type ParsedCoupon } from './parseCoupon';

export const COUPON_BARCODE_TYPES: BarcodeType[] = ['ean13', 'ean8', 'code128', 'itf14', 'code39', 'upc_a', 'qr', 'datamatrix', 'pdf417'];

export type CouponScan = ParsedCoupon & {
  text: string;
  barcode: string | null;
  barcodeType: string | null;
};

/** On-device OCR (ML Kit) + barcode reading of a coupon photo. Never throws: fields stay null. */
export async function scanCouponPhoto(uri: string, liveBarcode?: { data: string; type: string } | null): Promise<CouponScan> {
  const [ocr, codes] = await Promise.all([
    recognizeText(uri).catch(() => null),
    liveBarcode ? Promise.resolve([]) : scanFromURLAsync(uri, COUPON_BARCODE_TYPES).catch(() => []),
  ]);
  const text = ocr?.text ?? '';
  const code = liveBarcode ?? codes[0] ?? null;
  return { ...parseCouponText(text), text, barcode: code?.data ?? null, barcodeType: code?.type ?? null };
}
