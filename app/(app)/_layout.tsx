import { Redirect, Slot } from 'expo-router';
import { useAuth } from '../../src/features/auth/provider';
import { Shell, Loading } from '../../src/components/ui';
import { NotificationBridge } from '../../src/features/notifications/bridge';
export default function ProtectedLayout() {
  const { member, loading } = useAuth();
  if (loading)
    return (
      <Shell title="Convivio">
        <Loading />
      </Shell>
    );
  if (!member) return <Redirect href="/" />;
  return (
    <>
      <NotificationBridge />
      <Slot />
    </>
  );
}
