import { Linking, Platform } from 'react-native';

/** Opens turn-by-turn navigation in the platform's maps app (web fallback). */
export async function openNavigation(lat: number, lon: number, label: string): Promise<void> {
  const name = encodeURIComponent(label);
  const native =
    Platform.OS === 'ios' ? `maps://?daddr=${lat},${lon}&q=${name}` : `geo:0,0?q=${lat},${lon}(${name})`;
  try {
    await Linking.openURL(native);
  } catch {
    await Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`);
  }
}
