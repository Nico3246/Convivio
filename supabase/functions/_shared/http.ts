export type ServerConfig = {
  url: string;
  serviceKey: string;
  workerSecret: string;
  expoAccessToken?: string;
};
export type HttpClient = typeof fetch;

export function configuration(): ServerConfig {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) throw new Error('Configuración de servidor incompleta');
  return {
    url: url.replace(/\/$/, ''),
    serviceKey,
    workerSecret: Deno.env.get('CONVIVIO_WORKER_SECRET') ?? '',
    expoAccessToken: Deno.env.get('EXPO_ACCESS_TOKEN'),
  };
}

export function response(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Respuesta no válida');
  return value as Record<string, unknown>;
}

export async function rpc(
  config: ServerConfig,
  name: string,
  args: Record<string, unknown>,
  http: HttpClient,
): Promise<unknown> {
  const res = await http(`${config.url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: config.serviceKey,
      Authorization: `Bearer ${config.serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`RPC ${name} no completado (${res.status})`);
  const text = await res.text();
  return text ? (JSON.parse(text) as unknown) : null;
}

export async function sameSecret(received: string, expected: string): Promise<boolean> {
  if (!expected || !received) return false;
  const encode = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encode.encode(received)),
    crypto.subtle.digest('SHA-256', encode.encode(expected)),
  ]);
  const aa = new Uint8Array(a);
  const bb = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < aa.length; i++) diff |= (aa[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}
