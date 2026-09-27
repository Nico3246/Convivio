import { expect, test, vi } from 'vitest';
import { sendPush } from '../supabase/functions/maintenance/push';
const config = {
  url: 'https://example.test',
  serviceKey: 'service-key',
  workerSecret: 'worker-secret',
  expoAccessToken: 'expo-secret',
};
const job = {
  id: 'job',
  lease_id: 'lease',
  token: 'ExpoPushToken[test]',
  ticket_id: null,
  notification_id: 'notification',
  report_id: 'report',
  exception_id: null,
  kind: 'WEEKLY_REPORT',
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
test('envía el texto semanal sin datos privados, y guarda un ticket pendiente de recibo', async () => {
  const http = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(json([job]))
    .mockResolvedValueOnce(json({ data: { status: 'ok', id: 'ticket' } }))
    .mockResolvedValueOnce(json(null));
  expect(await sendPush(config, http)).toBe(0);
  const sent = JSON.parse(String(http.mock.calls[1]?.[1]?.body));
  expect(sent).toEqual({
    to: job.token,
    title: 'Convivio',
    body: 'Resumen semanal disponible',
    channelId: 'convivio',
    sound: 'default',
    data: { notificationId: 'notification', reportId: 'report', exceptionId: null },
  });
  expect(http.mock.calls[1]?.[1]?.headers).toMatchObject({ Authorization: 'Bearer expo-secret' });
  expect(JSON.parse(String(http.mock.calls[2]?.[1]?.body))).toMatchObject({
    p_result: 'TICKET',
    p_ticket: 'ticket',
  });
});
test('un recibo de Expo confirma la entrega y no vuelve a enviar la notificación', async () => {
  const http = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(json([{ ...job, ticket_id: 'ticket' }]))
    .mockResolvedValueOnce(json({ data: { ticket: { status: 'ok' } } }))
    .mockResolvedValueOnce(json(null));
  expect(await sendPush(config, http)).toBe(1);
  expect(http.mock.calls[1]?.[0]).toBe('https://exp.host/--/api/v2/push/getReceipts');
  expect(JSON.parse(String(http.mock.calls[1]?.[1]?.body))).toEqual({ ids: ['ticket'] });
  expect(JSON.parse(String(http.mock.calls[2]?.[1]?.body))).toMatchObject({ p_result: 'OK' });
});
test.each(['DeviceNotRegistered', 'MessageRateExceeded'])(
  'gestiona el error de entrega %s sin darla por completada',
  async (error) => {
    const http = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json([job]))
      .mockResolvedValueOnce(json({ data: { status: 'error', details: { error } } }))
      .mockResolvedValueOnce(json(null));
    expect(await sendPush(config, http)).toBe(0);
    expect(JSON.parse(String(http.mock.calls[2]?.[1]?.body))).toMatchObject({
      p_result: error === 'DeviceNotRegistered' ? 'DISABLE' : 'RETRY',
    });
  },
);
test('un recibo todavía vacío queda pendiente', async () => {
  const http = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(json([{ ...job, ticket_id: 'ticket' }]))
    .mockResolvedValueOnce(json({ data: {} }))
    .mockResolvedValueOnce(json(null));
  expect(await sendPush(config, http)).toBe(0);
  expect(JSON.parse(String(http.mock.calls[2]?.[1]?.body))).toMatchObject({ p_result: 'RETRY' });
});
