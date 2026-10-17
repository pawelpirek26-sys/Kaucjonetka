// Deep link target for magic links and OAuth: kaucjomat://auth/callback?code=...
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Screen } from '@/components/ui';
import { requireSupabase } from '@/lib/supabase/client';

export default function AuthCallbackScreen() {
  const router = useRouter();
  const { code, error_description: errorDescription } = useLocalSearchParams<{ code?: string; error_description?: string }>();
  const [error, setError] = useState<string | null>(errorDescription ?? null);

  useEffect(() => {
    if (!code || errorDescription) return;
    requireSupabase()
      .auth.exchangeCodeForSession(code)
      .then(({ error: e }) => {
        if (e) setError(e.message);
        else router.replace('/settings');
      })
      .catch((e: Error) => setError(e.message));
  }, [code, errorDescription, router]);

  return (
    <Screen>
      {error || !code ? (
        <>
          <ThemedText>{error ?? 'Link logowania jest nieprawidłowy lub wygasł.'}</ThemedText>
          <Button title="Spróbuj ponownie" onPress={() => router.replace('/sign-in')} />
        </>
      ) : (
        <>
          <ActivityIndicator />
          <ThemedText style={{ textAlign: 'center' }}>Logowanie…</ThemedText>
        </>
      )}
    </Screen>
  );
}
