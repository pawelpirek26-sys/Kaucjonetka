import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

const PHOTO_DIR = new Directory(Paths.document, 'coupons');

/**
 * Downscales a camera photo (OCR works well at ~1600 px) and keeps it in app storage.
 * Returns the file name to store in the database (not an absolute path: on iOS the app
 * container path changes after every reinstall or update).
 */
export async function storeCouponPhoto(sourceUri: string, couponId: string): Promise<string> {
  PHOTO_DIR.create({ intermediates: true, idempotent: true });
  const target = new File(PHOTO_DIR, `${couponId}.jpg`);
  if (target.exists) target.delete();
  try {
    const image = await ImageManipulator.manipulate(sourceUri).resize({ width: 1600 }).renderAsync();
    const saved = await image.saveAsync({ compress: 0.7, format: SaveFormat.JPEG });
    new File(saved.uri).move(target);
  } catch (e) {
    // keep the original photo rather than losing it
    console.warn('[photo] resize failed, keeping original', e);
    if (target.exists) target.delete();
    new File(sourceUri).copy(target);
  }
  return target.name;
}

/** Current file URI of a stored photo, or null when the file is gone. Accepts legacy absolute URIs. */
export function resolvePhotoUri(stored: string | null): string | null {
  if (!stored) return null;
  const name = stored.slice(stored.lastIndexOf('/') + 1);
  const file = new File(PHOTO_DIR, name);
  if (file.exists) return file.uri;
  if (stored.includes('/')) {
    const legacy = new File(stored);
    if (legacy.exists) return legacy.uri;
  }
  return null;
}

export function deleteCouponPhoto(stored: string | null): void {
  const uri = resolvePhotoUri(stored);
  if (uri) new File(uri).delete();
}

export async function readPhotoBytes(stored: string): Promise<ArrayBuffer | null> {
  const uri = resolvePhotoUri(stored);
  return uri ? new File(uri).arrayBuffer() : null;
}
