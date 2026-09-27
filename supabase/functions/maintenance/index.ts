import {
  configuration,
  object,
  response,
  rpc,
  sameSecret,
  type HttpClient,
  type ServerConfig,
} from '../_shared/http.ts';
import { sendPush } from './push.ts';

type CleanupJob = {
  id: string;
  lease_id: string;
  kind: 'STORAGE' | 'AUTH';
  bucket?: string;
  object_path?: string;
  auth_user_id?: string;
};
function cleanupJob(value: unknown): CleanupJob {
  const job = object(value);
  if (typeof job.id !== 'string' || typeof job.lease_id !== 'string')
    throw new Error('Trabajo no válido');
  if (
    job.kind === 'STORAGE' &&
    typeof job.bucket === 'string' &&
    typeof job.object_path === 'string'
  )
    return {
      id: job.id,
      lease_id: job.lease_id,
      kind: 'STORAGE',
      bucket: job.bucket,
      object_path: job.object_path,
    };
  if (job.kind === 'AUTH' && typeof job.auth_user_id === 'string')
    return { id: job.id, lease_id: job.lease_id, kind: 'AUTH', auth_user_id: job.auth_user_id };
  throw new Error('Trabajo no válido');
}

export function maintenanceHandler(config: ServerConfig, http: HttpClient = fetch) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return response(405, { error: 'Método no permitido' });
    if (
      !(await sameSecret(
        request.headers.get('x-convivio-worker-secret') ?? '',
        config.workerSecret,
      ))
    )
      return response(401, { error: 'No autorizado' });
    const deadline = Date.now() + 45_000;
    const workerHttp: HttpClient = (input, init) =>
      http(input, {
        ...init,
        signal: AbortSignal.any([
          ...(init?.signal ? [init.signal] : []),
          AbortSignal.timeout(Math.max(0, deadline - Date.now())),
        ]),
      });
    let completed = 0;
    let deferred = 0;
    try {
      const claimed = await rpc(config, 'claim_cleanup', { p_limit: 5 }, workerHttp);
      if (!Array.isArray(claimed)) throw new Error('Cola no válida');
      const jobs = claimed
        .map(cleanupJob)
        .sort((a, b) => Number(a.kind === 'AUTH') - Number(b.kind === 'AUTH'));
      for (const job of jobs) {
        let success = false;
        try {
          const url =
            job.kind === 'STORAGE'
              ? `${config.url}/storage/v1/object/${encodeURIComponent(job.bucket ?? '')}`
              : `${config.url}/auth/v1/admin/users/${encodeURIComponent(job.auth_user_id ?? '')}`;
          const deleted = await workerHttp(url, {
            method: 'DELETE',
            headers: {
              apikey: config.serviceKey,
              Authorization: `Bearer ${config.serviceKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(
              job.kind === 'STORAGE'
                ? { prefixes: [job.object_path] }
                : { should_soft_delete: false },
            ),
            signal: AbortSignal.timeout(10000),
          });
          success = deleted.ok || deleted.status === 404;
        } catch {
          success = false;
        }
        // Even if this ack fails, the lease expires and physical deletion can be
        // retried safely. Never remove a job after an unconfirmed remote failure.
        await rpc(
          config,
          'finish_cleanup',
          { p_id: job.id, p_lease: job.lease_id, p_success: success },
          workerHttp,
        );
        if (success) completed++;
        else deferred++;
      }
      const reports = await rpc(config, 'run_maintenance', {}, workerHttp);
      await rpc(config, 'cleanup_attachment_reservations', {}, workerHttp);
      const pushConfirmed = await sendPush(config, workerHttp);
      return response(200, { completed, deferred, reports, pushConfirmed });
    } catch {
      return response(503, { error: 'Mantenimiento pendiente de reintento', completed, deferred });
    }
  };
}

if (typeof Deno !== 'undefined') Deno.serve(maintenanceHandler(configuration()));
