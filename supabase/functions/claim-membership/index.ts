import {
  configuration,
  object,
  response,
  rpc,
  type HttpClient,
  type ServerConfig,
} from '../_shared/http.ts';

export function claimHandler(config: ServerConfig, http: HttpClient = fetch) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return response(405, { error: 'Método no permitido' });
    const authorization = request.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) return response(401, { error: 'Inicia sesión' });
    try {
      // Obtain authoritative identity from Auth. Never use an email, role or
      // user ID supplied in the request body or decoded from an unverified JWT.
      const verified = await http(`${config.url}/auth/v1/user`, {
        headers: { apikey: config.serviceKey, Authorization: authorization },
        signal: AbortSignal.timeout(15000),
      });
      if (!verified.ok) return response(401, { error: 'Sesión no válida' });
      const user = object(await verified.json());
      if (
        typeof user.id !== 'string' ||
        typeof user.email !== 'string' ||
        !user.email_confirmed_at ||
        !Array.isArray(user.identities) ||
        !user.identities.some((identity) => object(identity).provider === 'google')
      ) {
        return response(403, { error: 'Se requiere una cuenta de Google verificada' });
      }
      const metadata =
        user.user_metadata && typeof user.user_metadata === 'object'
          ? object(user.user_metadata)
          : {};
      const name =
        (typeof metadata.full_name === 'string'
          ? metadata.full_name
          : (user.email.split('@')[0] ?? 'Usuario')
        )
          .trim()
          .slice(0, 80) || 'Usuario';
      try {
        const memberId = await rpc(
          config,
          'claim_membership',
          {
            p_auth_user: user.id,
            p_verified_email: user.email,
            p_name: name,
          },
          http,
        );
        return response(200, { member_id: memberId });
      } catch {
        // Do not expose the invitation list, database error or another user's email.
        return response(403, { error: 'Esta cuenta no está autorizada para entrar en Convivio' });
      }
    } catch {
      return response(503, { error: 'No se ha podido comprobar el acceso. Inténtalo de nuevo.' });
    }
  };
}

if (typeof Deno !== 'undefined') Deno.serve(claimHandler(configuration()));
