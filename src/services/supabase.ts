import 'react-native-url-polyfill/auto';
import { polyfillWebCrypto } from 'expo-standard-web-crypto';
import { createClient, processLock, type SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import type { Database } from './database.types';
import { boundedFetch } from './network';

// Supabase's PKCE verifier must use native cryptographic randomness in Hermes.
polyfillWebCrypto();

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const isConfigured = Boolean(url && key);
let client: SupabaseClient<Database> | undefined;

export function supabase(): SupabaseClient<Database> {
  if (!url || !key) throw new Error('La aplicación todavía no está configurada');
  client ??= createClient<Database>(url, key, {
    global: { fetch: boundedFetch },
    auth: {
      storage: {
        getItem: (name) => SecureStore.getItemAsync(name),
        setItem: (name, value) => SecureStore.setItemAsync(name, value),
        removeItem: (name) => SecureStore.deleteItemAsync(name),
      },
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
      lock: processLock,
    },
  });
  return client;
}
