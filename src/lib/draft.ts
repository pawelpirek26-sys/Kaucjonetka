// Hand-off from the camera screen to the coupon form (kept in memory only).
import type { CouponScan } from '@/lib/ocr/recognize';

export type CouponDraft = {
  id: string;
  photoUri: string | null;
  scan: CouponScan | null;
  storeIdHint: number | null;
};

let draft: CouponDraft | null = null;

export function setDraft(d: CouponDraft): void {
  draft = d;
}

export function takeDraft(): CouponDraft | null {
  const d = draft;
  draft = null;
  return d;
}
