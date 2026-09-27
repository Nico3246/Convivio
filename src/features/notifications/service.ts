import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { AppError, call } from '../../services/api';
import type { Membership } from '../auth/model';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});
export async function enableNotifications(member: Membership) {
  if (!Device.isDevice) throw new AppError('Activa las notificaciones desde un móvil real.');
  const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? Constants.easConfig?.projectId;
  if (!projectId)
    throw new AppError(
      'Las notificaciones todavía no están configuradas. Consulta con el administrador.',
    );
  await Notifications.setNotificationChannelAsync('convivio', {
    name: 'Convivio',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
  const permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted)
    throw new AppError(
      'No has autorizado las notificaciones. Puedes activarlas desde los ajustes del teléfono.',
    );
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await call('register_push_token', { p_household: member.household_id, p_token: token });
  await SecureStore.setItemAsync('convivio.push-token', token);
}
export async function disableNotifications(member: Membership) {
  const token = await SecureStore.getItemAsync('convivio.push-token');
  if (token)
    await call('unregister_push_token', { p_household: member.household_id, p_token: token });
  await SecureStore.deleteItemAsync('convivio.push-token');
}
