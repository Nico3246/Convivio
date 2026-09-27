import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import { supabase } from '../../services/supabase';
import { membershipListSchema, type Membership } from './model';
import { requireS256 } from './pkce';
import { AppError } from '../../services/api';

WebBrowser.maybeCompleteAuthSession();

// Hot browser completion and a cold deep link may consume the same callback.
let lastExchange: { code: string; promise: Promise<void> } | undefined;
export function completeGoogleSignIn(code: string): Promise<void> {
  if (!code || code.length > 2048)
    return Promise.reject(new AppError('Respuesta de acceso no válida.'));
  if (lastExchange?.code === code) return lastExchange.promise;
  const promise = (async () => {
    const { error } = await supabase().auth.exchangeCodeForSession(code);
    if (error) throw new AppError('No se ha podido completar el acceso. Vuelve a iniciar sesión.');
  })();
  lastExchange = { code, promise };
  return promise;
}

export async function signInWithGoogle(): Promise<void> {
  const client = supabase();
  const redirectTo = makeRedirectUri({ scheme: 'convivio', path: 'auth/callback' });
  const { data, error } = await client.auth.signInWithOAuth({
  provider: 'google',
  options: {
    redirectTo,
    skipBrowserRedirect: true,
    queryParams: {
      prompt: 'select_account',
    },
  },
});
  if (error || !data.url) throw new Error('No se ha podido abrir Google');
  const authorizationUrl = await requireS256(data.url, (value) =>
    Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value, {
      encoding: Crypto.CryptoEncoding.BASE64,
    }),
  );
  const result = await WebBrowser.openAuthSessionAsync(authorizationUrl, redirectTo);
  if (result.type !== 'success') return;
  const callback = new URL(result.url);
  const expected = new URL(redirectTo);
  if (
    callback.protocol !== expected.protocol ||
    callback.host !== expected.host ||
    callback.pathname !== expected.pathname
  )
    throw new Error('Respuesta de acceso no válida');
  const code = callback.searchParams.get('code');
  if (!code) throw new Error('Google no ha completado el acceso');
  await completeGoogleSignIn(code);
}

export async function loadMembership(): Promise<Membership | null> {
  const client = supabase();
  const { data, error } = await client.rpc('get_session');
  if (error) throw new Error('No se ha podido comprobar tu acceso');
  const existing = membershipListSchema.parse(data)[0];
  if (existing) return existing;
  const admitted = await client.functions.invoke('claim-membership', { body: {} });
  if (admitted.error) return null;
  const reloaded = await client.rpc('get_session');
  if (reloaded.error) throw new Error('No se ha podido comprobar tu acceso');
  return membershipListSchema.parse(reloaded.data)[0] ?? null;
}
