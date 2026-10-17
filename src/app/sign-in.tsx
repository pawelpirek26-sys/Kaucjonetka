import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Field, Screen } from '@/components/ui';
import { sendMagicLink, signInWithProvider } from '@/lib/auth';

export default function SignInScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const attempt = async (key: string, job: () => Promise<boolean | void>) => {
    setBusy(key);
    setError(null);
    try {
      const done = await job();
      if (done === true) router.back();
    } catch (e) {
      setError((e as Error).message || 'Logowanie nie powiodło się.');
    } finally {
      setBusy(null);
    }
  };

  const validEmail = /^\S+@\S+\.\S+$/.test(email.trim());

  return (
    <Screen>
      <ThemedText themeColor="textSecondary">
        Konto służy do zgłaszania stanu automatów i opcjonalnej kopii zapasowej. Kupony bez kopii zostają na telefonie.
      </ThemedText>
      <Card>
        {sent ? (
          <ThemedText>Wysłaliśmy link na {email.trim()}. Otwórz go na tym telefonie, aby się zalogować.</ThemedText>
        ) : (
          <>
            <Field label="E-mail" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" placeholder="ty@example.com" />
            <Button title="Wyślij link logowania" disabled={!validEmail} loading={busy === 'email'} onPress={() => attempt('email', async () => { await sendMagicLink(email); setSent(true); })} />
          </>
        )}
      </Card>
      <Button title="Kontynuuj z Google" variant="secondary" loading={busy === 'google'} onPress={() => attempt('google', () => signInWithProvider('google'))} />
      <Button title={Platform.OS === 'ios' ? 'Zaloguj się przez Apple' : 'Kontynuuj z Apple'} variant="secondary" loading={busy === 'apple'} onPress={() => attempt('apple', () => signInWithProvider('apple'))} />
      {error ? <ThemedText style={{ color: '#C23B3B' }}>{error}</ThemedText> : null}
    </Screen>
  );
}
