import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Convivio',
  icon: './assets/convivio-logo.png',
  slug: 'convivio',
  version: '0.2.0',
  orientation: 'portrait',
  scheme: 'convivio',
  userInterfaceStyle: 'automatic',
  platforms: ['android'],
  android: {
    allowBackup: false,
    adaptiveIcon: {
      foregroundImage: './assets/convivio-logo.png',
      monochromeImage: './assets/convivio-logo.png',
      backgroundColor: '#F8FAFC',
    },
    package:
      process.env.EXPO_PUBLIC_ENVIRONMENT === 'production'
        ? 'app.convivio.mobile'
        : 'app.convivio.mobile.dev',
    versionCode: 2,
    ...(process.env.GOOGLE_SERVICES_JSON
      ? { googleServicesFile: process.env.GOOGLE_SERVICES_JSON }
      : {}),
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-web-browser',
    'expo-system-ui',
    '@react-native-community/datetimepicker',
    ['expo-image-picker', { microphonePermission: false }],
    'expo-notifications',
  ],
  extra: {
    eas: {
      projectId: '983cbff8-614e-4071-b171-cdc37010bcb2',
    },
  },
  experiments: { typedRoutes: true },
});
