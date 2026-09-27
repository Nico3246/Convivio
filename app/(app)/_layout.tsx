import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../src/features/auth/provider';
import { Shell, Loading } from '../../src/components/ui';
import { NotificationBridge } from '../../src/features/notifications/bridge';
import { screenTransition, useReducedMotion } from '../../src/components/motion';
import { useTheme } from '../../src/theme/provider';
export default function ProtectedLayout() {
  const { member, loading } = useAuth();
  const { theme } = useTheme();
  const reducedMotion = useReducedMotion();
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
      <Stack
        screenOptions={({ route }) => ({
          headerShown: false,
          animation: screenTransition(route.params, reducedMotion),
          animationTypeForReplace: 'push',
          contentStyle: { backgroundColor: theme.background },
        })}
      />
    </>
  );
}
