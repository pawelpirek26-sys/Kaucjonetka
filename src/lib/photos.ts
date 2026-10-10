import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

const PHOTO_DIR = new Directory(Paths.document, 'coupons');

/** Downscales a camera photo (OCR works well at ~1600 px) and keeps it in app storage. */
export async function storeCouponPhoto(sourceUri: string, couponId: string): Promise<string> {
  const image = await ImageManipulator.manipulate(sourceUri).resize({ width: 1600 }).renderAsync();
  const saved = await image.saveAsync({ compress: 0.7, format: SaveFormat.JPEG });
  PHOTO_DIR.create({ intermediates: true, idempotent: true });
  const target = new File(PHOTO_DIR, `${couponId}.jpg`);
  if (target.exists) target.delete();
  await new File(saved.uri).move(target);
  return target.uri;
}

export function deleteCouponPhoto(uri: string | null): void {
  if (!uri) return;
  const file = new File(uri);
  if (file.exists) file.delete();
}

export async function readPhotoBytes(uri: string): Promise<ArrayBuffer> {
  return new File(uri).arrayBuffer();
}
