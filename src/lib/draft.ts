// Hand-off from the camera screen to the coupon form (kept in memory only).
import type { CouponScan } from '@/lib/ocr/recognize';

export type CouponDraft = {
  id: string;
  photoUri: string | null;
  scan: CouponScan | null;
  storeIdHint: number | null;
};

// Keyed by coupon id and kept until saved, so a remounted form still finds its photo.
const drafts = new Map<string, CouponDraft>();

export function setDraft(d: CouponDraft): void {
  drafts.set(d.id, d);
}

export function getDraft(id: string | null | undefined): CouponDraft | null {
  return (id && drafts.get(id)) || null;
}

export function clearDraft(id: string): void {
  drafts.delete(id);
}
