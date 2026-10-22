import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Storage } from 'expo-sqlite/kv-store';
import { AppState } from 'react-native';

import type { Database } from './database.types';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/** null when the app is built without backend config: the wallet still works offline. */
export const supabase: SupabaseClient<Database> | null =
  url && key
    ? createClient<Database>(url, key, {
        auth: {
          storage: Storage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
          flowType: 'pkce',
        },
      })
    : null;

if (supabase) {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

export class BackendNotConfiguredError extends Error {
  constructor() {
    super('backend_not_configured');
  }
}

export function requireSupabase(): SupabaseClient<Database> {
  if (!supabase) throw new BackendNotConfiguredError();
  return supabase;
}
