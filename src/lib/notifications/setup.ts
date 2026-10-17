import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export const CHANNEL_STORE = 'store';
export const CHANNEL_REMINDERS = 'reminders';
export const CATEGORY_STORE_EXIT = 'store-exit';
export const ACTION_SCAN = 'scan';
export const ACTION_REPORT = 'report';

let configured: Promise<void> | null = null;

/** Handler, Android channels and the actionable "left the store" category. Idempotent. */
export function configureNotifications(): Promise<void> {
  configured ??= (async () => {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL_STORE, {
        name: 'Kupony przy sklepie',
        description: 'Gdy jesteś w sklepie, w którym masz kupony',
        importance: Notifications.AndroidImportance.HIGH,
      });
      await Notifications.setNotificationChannelAsync(CHANNEL_REMINDERS, {
        name: 'Ważność kuponów',
        description: '3 dni i 1 dzień przed końcem ważności kuponu',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    await Notifications.setNotificationCategoryAsync(CATEGORY_STORE_EXIT, [
      { identifier: ACTION_SCAN, buttonTitle: 'Zeskanuj kupon', options: { opensAppToForeground: true } },
      { identifier: ACTION_REPORT, buttonTitle: 'Jak działał automat?', options: { opensAppToForeground: true } },
    ]);
  })().catch((e) => {
    configured = null;
    throw e;
  });
  return configured;
}

export async function hasNotificationPermission(): Promise<boolean> {
  return (await Notifications.getPermissionsAsync()).granted;
}

/** Asks only when the OS still allows asking; returns the resulting state. */
export async function requestNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted || !current.canAskAgain) return current.granted;
  return (await Notifications.requestPermissionsAsync()).granted;
}
