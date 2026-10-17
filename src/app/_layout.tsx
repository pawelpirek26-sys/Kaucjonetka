// Registers the geofence task before anything renders, so background wake-ups find it.
import '@/lib/geofence/task';

import * as Notifications from 'expo-notifications';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter, type Href } from 'expo-router';
import { useEffect } from 'react';
import { AppState, useColorScheme } from 'react-native';

import { onAppActive } from '@/lib/bootstrap';
import { hrefForResponse } from '@/lib/notifications/schedule';

function useNotificationNavigation() {
  const router = useRouter();
  useEffect(() => {
    const open = (response: Notifications.NotificationResponse | null) => {
      const href = response ? hrefForResponse(response) : null;
      if (href) router.push(href as Href);
    };
    Notifications.getLastNotificationResponseAsync().then((r) => {
      open(r);
      if (r) Notifications.clearLastNotificationResponseAsync();
    });
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, [router]);
}

function useForegroundBootstrap() {
  useEffect(() => {
    onAppActive().catch((e) => console.warn('[bootstrap]', e));
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') onAppActive().catch((e) => console.warn('[bootstrap]', e));
    });
    return () => sub.remove();
  }, []);
}

export default function RootLayout() {
  const scheme = useColorScheme();
  useForegroundBootstrap();
  useNotificationNavigation();

  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="coupon/new" options={{ title: 'Zdjęcie kuponu', headerShown: false, presentation: 'fullScreenModal' }} />
        <Stack.Screen name="coupon/edit" options={{ title: 'Kupon' }} />
        <Stack.Screen name="coupon/[id]" options={{ title: 'Kupon' }} />
        <Stack.Screen name="point" options={{ title: 'Punkt zwrotu' }} />
        <Stack.Screen name="report" options={{ title: 'Jak działa automat?', presentation: 'modal' }} />
        <Stack.Screen name="location-permission" options={{ title: 'Przypomnienia przy sklepie', presentation: 'modal' }} />
        <Stack.Screen name="sign-in" options={{ title: 'Logowanie', presentation: 'modal' }} />
        <Stack.Screen name="auth/callback" options={{ title: 'Logowanie' }} />
      </Stack>
    </ThemeProvider>
  );
}
