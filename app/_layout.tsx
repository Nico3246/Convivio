import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../src/features/auth/provider';
import { ThemeProvider, useTheme } from '../src/theme/provider';
import { MotionProvider, useReducedMotion } from '../src/components/motion';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 }, mutations: { retry: false } },
});

function Navigation() {
  const { theme } = useTheme();
  const reducedMotion = useReducedMotion();
  return (
    <>
      <StatusBar style={theme.background === '#0F172A' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: reducedMotion ? 'none' : 'fade',
          animationTypeForReplace: 'push',
          contentStyle: { backgroundColor: theme.background },
        }}
      />
    </>
  );
}
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <MotionProvider>
            <AuthProvider>
              <Navigation />
            </AuthProvider>
          </MotionProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
