import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { requireSupabase, supabase } from '@/lib/supabase/client';

export const AUTH_REDIRECT = Linking.createURL('auth/callback');

export async function sendMagicLink(email: string): Promise<void> {
  const { error } = await requireSupabase().auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: AUTH_REDIRECT, shouldCreateUser: true },
  });
  if (error) throw error;
}

/** Completes PKCE sign-in from a redirect URL (magic link or OAuth). */
export async function completeAuthFromUrl(url: string): Promise<boolean> {
  const { queryParams } = Linking.parse(url);
  const code = typeof queryParams?.code === 'string' ? queryParams.code : null;
  const errorDescription = queryParams?.error_description;
  if (typeof errorDescription === 'string') throw new Error(errorDescription);
  if (!code) return false;
  const { error } = await requireSupabase().auth.exchangeCodeForSession(code);
  if (error) throw error;
  return true;
}

async function signInWithAppleNative(): Promise<boolean> {
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
    nonce: hashedNonce,
  });
  if (!credential.identityToken) throw new Error('apple_no_token');
  const { error } = await requireSupabase().auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
    nonce: rawNonce,
  });
  if (error) throw error;
  return true;
}

/** Google everywhere and Apple on Android use the browser OAuth flow; Apple on iOS is native. */
export async function signInWithProvider(provider: 'google' | 'apple'): Promise<boolean> {
  if (provider === 'apple' && Platform.OS === 'ios' && (await AppleAuthentication.isAvailableAsync())) {
    return signInWithAppleNative();
  }
  const { data, error } = await requireSupabase().auth.signInWithOAuth({
    provider,
    options: { redirectTo: AUTH_REDIRECT, skipBrowserRedirect: true },
  });
  if (error) throw error;
  const result = await WebBrowser.openAuthSessionAsync(data.url, AUTH_REDIRECT);
  if (result.type !== 'success') return false;
  return completeAuthFromUrl(result.url);
}

export async function signOut(): Promise<void> {
  await supabase?.auth.signOut();
}

export function useSession(): Session | null {
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  return session;
}
