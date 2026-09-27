/** Hermes may expose getRandomValues without SubtleCrypto. In that case the
 * auth SDK returns a plain challenge. Upgrade it using Expo's native SHA-256
 * BEFORE opening the browser; the verifier already saved by the SDK is unchanged.
 */
export async function requireS256(
  url: string,
  sha256Base64: (value: string) => Promise<string>,
): Promise<string> {
  const target = new URL(url);
  const challenge = target.searchParams.get('code_challenge');
  const method = target.searchParams.get('code_challenge_method')?.toLowerCase();
  if (!challenge || !method) throw new Error('No se ha podido proteger el inicio de sesión');
  if (method === 's256') return target.toString();
  if (method !== 'plain') throw new Error('Método de inicio de sesión no compatible');
  const digest = await sha256Base64(challenge);
  target.searchParams.set(
    'code_challenge',
    digest.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  );
  target.searchParams.set('code_challenge_method', 's256');
  return target.toString();
}
