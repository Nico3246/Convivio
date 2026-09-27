import { object, rpc, type HttpClient, type ServerConfig } from '../_shared/http.ts';

type Delivery = {
  id: string;
  lease_id: string;
  token: string;
  ticket_id: string | null;
  kind: string;
  notification_id: string;
  report_id: string | null;
  exception_id: string | null;
};
function delivery(value: unknown): Delivery {
  const row = object(value);
  for (const key of ['id', 'lease_id', 'token', 'notification_id', 'kind'])
    if (typeof row[key] !== 'string') throw new Error('Entrega no válida');
  for (const key of ['ticket_id', 'report_id', 'exception_id'])
    if (row[key] !== null && typeof row[key] !== 'string') throw new Error('Entrega no válida');
  return row as Delivery;
}

/** Generic payloads contain no names, allegations, financial data or photographs. */
export async function sendPush(config: ServerConfig, http: HttpClient): Promise<number> {
  const jobs = await rpc(config, 'claim_push_deliveries', { p_limit: 10 }, http);
  if (!Array.isArray(jobs)) throw new Error('Cola no válida');
  let confirmed = 0;
  for (const raw of jobs) {
    const job = delivery(raw);
    let result = 'RETRY';
    let ticket: string | null = null;
    try {
      const reply = await http(
        `https://exp.host/--/api/v2/push/${job.ticket_id ? 'getReceipts' : 'send'}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(config.expoAccessToken
              ? { Authorization: `Bearer ${config.expoAccessToken}` }
              : {}),
          },
          body: JSON.stringify(
            job.ticket_id
              ? { ids: [job.ticket_id] }
              : {
                  to: job.token,
                  title: 'Convivio',
                  body:
                    job.kind === 'WEEKLY_REPORT'
                      ? 'Resumen semanal disponible'
                      : 'Tienes una actualización de Convivio.',
                  channelId: 'convivio',
                  sound: 'default',
                  data: {
                    notificationId: job.notification_id,
                    reportId: job.report_id,
                    exceptionId: job.exception_id,
                  },
                },
          ),
          signal: AbortSignal.timeout(8000),
        },
      );
      if (reply.ok) {
        const payload = object(await reply.json());
        const entry = job.ticket_id ? object(payload.data)[job.ticket_id] : payload.data;
        if (entry && typeof entry === 'object') {
          const outcome = object(entry);
          if (outcome.status === 'ok') {
            if (job.ticket_id) {
              result = 'OK';
              confirmed++;
            } else if (typeof outcome.id === 'string') {
              result = 'TICKET';
              ticket = outcome.id;
            }
          } else if (outcome.details && object(outcome.details).error === 'DeviceNotRegistered')
            result = 'DISABLE';
        }
      }
    } catch {
      /* Keep the lease retryable. Never log tokens or payloads. */
    }
    await rpc(
      config,
      'finish_push_delivery',
      { p_id: job.id, p_lease: job.lease_id, p_result: result, p_ticket: ticket },
      http,
    );
  }
  return confirmed;
}
