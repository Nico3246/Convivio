import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { z } from 'zod';
import { go } from '../../components/ui';
import { useMember } from '../auth/provider';
import { call } from '../../services/api';
const payload = z.object({
  notificationId: z.uuid(),
  reportId: z.uuid().nullable(),
  exceptionId: z.uuid().nullable(),
});
export function NotificationBridge() {
  const member = useMember();
  useEffect(() => {
    let active = true;
    const open = (value: Notifications.NotificationResponse | null) => {
      if (!active || !value) return;
      const result = payload.safeParse(value.notification.request.content.data);
      if (!result.success) return;
      const data = result.data;
      void call('mark_notification_read', {
        p_household: member.household_id,
        p_notification: data.notificationId,
      }).catch(() => undefined);
      if (data.reportId) go('report', { id: data.reportId });
      else if (data.exceptionId) go('visit', { id: data.exceptionId });
      void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
    };
    const listener = Notifications.addNotificationResponseReceivedListener(open);
    void Notifications.getLastNotificationResponseAsync()
      .then(open)
      .catch(() => undefined);
    return () => {
      active = false;
      listener.remove();
    };
  }, [member.household_id]);
  return null;
}
