import { expect, test, vi } from 'vitest';
import { claimHandler } from '../supabase/functions/claim-membership/index';
import { maintenanceHandler } from '../supabase/functions/maintenance/index';
import type { ServerConfig } from '../supabase/functions/_shared/http';

const config: ServerConfig = {
  url: 'https://example.test',
  serviceKey: 'test-service-key',
  workerSecret: 'test-worker-secret',
};
const post = (headers: Record<string, string> = {}, body = '{}') =>
  new Request('https://example.test/function', { method: 'POST', headers, body });
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

test('la admisión no confía en email, identidad ni rol enviados por el cliente', async () => {
  const http = vi.fn<typeof fetch>();
  http.mockResolvedValueOnce(
    json({
      id: 'verified-id',
      email: 'verified@example.test',
      email_confirmed_at: '2026-01-01',
      identities: [{ provider: 'google' }],
      user_metadata: { full_name: 'Usuario' },
    }),
  );
  http.mockResolvedValueOnce(json('member-id'));
  const res = await claimHandler(
    config,
    http,
  )(
    post(
      { Authorization: 'Bearer user-token' },
      JSON.stringify({
        p_auth_user: 'forged',
        p_verified_email: 'admin@example.test',
        role: 'ADMIN',
      }),
    ),
  );
  expect(res.status).toBe(200);
  const args = JSON.parse(String(http.mock.calls[1]?.[1]?.body)) as Record<string, unknown>;
  expect(args.p_auth_user).toBe('verified-id');
  expect(args.p_verified_email).toBe('verified@example.test');
  expect(args).not.toHaveProperty('role');
});
test('un JWT rechazado por Auth no llega a una operación privilegiada', async () => {
  const http = vi.fn<typeof fetch>().mockResolvedValue(json({ error: 'invalid' }, 401));
  expect((await claimHandler(config, http)(post({ Authorization: 'Bearer forged' }))).status).toBe(
    401,
  );
  expect(http).toHaveBeenCalledTimes(1);
});
test('la falta de autorización no revela el listado de correos ni errores SQL', async () => {
  const http = vi.fn<typeof fetch>();
  http.mockResolvedValueOnce(
    json({
      id: 'id',
      email: 'user@example.test',
      email_confirmed_at: 'yes',
      identities: [{ provider: 'google' }],
    }),
  );
  http.mockResolvedValueOnce(json({ error: 'SQL_PRIVATE_DETAIL' }, 403));
  const res = await claimHandler(config, http)(post({ Authorization: 'Bearer token' }));
  expect(res.status).toBe(403);
  expect(await res.text()).not.toContain('SQL_PRIVATE_DETAIL');
});
test('una llamada de mantenimiento sin secreto no hace peticiones', async () => {
  const http = vi.fn<typeof fetch>();
  expect((await maintenanceHandler(config, http)(post())).status).toBe(401);
  expect(http).not.toHaveBeenCalled();
});
test('un borrado físico fallido permanece pendiente de reintento', async () => {
  const http = vi.fn<typeof fetch>();
  http.mockResolvedValueOnce(
    json([
      {
        id: 'job',
        lease_id: 'lease',
        kind: 'STORAGE',
        bucket: 'fault-evidence',
        object_path: 'photo.jpg',
      },
    ]),
  );
  http.mockResolvedValueOnce(json({ error: 'temporary' }, 503));
  http.mockResolvedValueOnce(json(null));
  http.mockResolvedValueOnce(json(0));
  http.mockResolvedValueOnce(json(null));
  http.mockResolvedValueOnce(json([]));
  const res = await maintenanceHandler(
    config,
    http,
  )(post({ 'x-convivio-worker-secret': config.workerSecret }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ completed: 0, deferred: 1, reports: 0, pushConfirmed: 0 });
  const ack = JSON.parse(String(http.mock.calls[2]?.[1]?.body)) as Record<string, unknown>;
  expect(ack).toEqual({ p_id: 'job', p_lease: 'lease', p_success: false });
});
test('el borrado físico ya completado admite reintentos y no convierte la baja en borrado lógico', async () => {
  const http = vi.fn<typeof fetch>();
  http.mockResolvedValueOnce(
    json([{ id: 'job', lease_id: 'lease', kind: 'AUTH', auth_user_id: 'account' }]),
  );
  http.mockResolvedValueOnce(json({ error: 'already-gone' }, 404));
  http.mockResolvedValueOnce(json(null));
  http.mockResolvedValueOnce(json(0));
  http.mockResolvedValueOnce(json(null));
  http.mockResolvedValueOnce(json([]));
  const res = await maintenanceHandler(
    config,
    http,
  )(post({ 'x-convivio-worker-secret': config.workerSecret }));
  expect(res.status).toBe(200);
  expect(JSON.parse(String(http.mock.calls[1]?.[1]?.body))).toEqual({ should_soft_delete: false });
  expect(JSON.parse(String(http.mock.calls[2]?.[1]?.body))).toMatchObject({ p_success: true });
});
