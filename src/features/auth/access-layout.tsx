import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BrandLogo } from '../../components/brand-logo';
import { useTheme } from '../../theme/provider';

/** Presentation only: Google, membership and sign-out stay in the existing flow. */
export function AccessLayout({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  const { height, fontScale } = useWindowDimensions();
  const compact = height < 700 || fontScale > 1.2;
  return (
    <SafeAreaView style={[styles.page, { backgroundColor: theme.background }]}>
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.decoration}
      >
        <View style={[styles.corner, { backgroundColor: theme.soft }]} />
        <View style={[styles.cornerOutline, { borderColor: theme.border }]} />
      </View>
      <ScrollView
        bounces={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, compact && { paddingVertical: 20 }]}
      >
        <View style={styles.content}>
          <View
            style={[styles.hero, compact && { minHeight: 0, paddingTop: 0, paddingBottom: 24 }]}
          >
            <View
              accessible={false}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={[styles.emblemFrame, compact && { height: 124, marginBottom: 12 }]}
            >
              <View style={[styles.emblem, compact && { transform: [{ scale: 0.55 }] }]}>
                <View style={[styles.halo, { backgroundColor: theme.soft }]} />
                <View style={[styles.orbit, { borderColor: theme.border }]} />
                <BrandLogo size={142} />
                <View style={[styles.dot, { backgroundColor: theme.primary }]} />
              </View>
            </View>
            <Text
              accessibilityRole="header"
              style={[
                styles.title,
                { color: theme.text },
                compact && { fontSize: 36, lineHeight: 44 },
              ]}
            >
              Convivio
            </Text>
            <Text style={[styles.subtitle, { color: theme.secondary }]}>
              Vivir juntos, más fácil.
            </Text>
          </View>
          <View style={[styles.actions, compact && { paddingBottom: 12 }]}>{children}</View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export function GoogleButton({ busy, onPress }: { busy: boolean; onPress: () => unknown }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Continuar con Google"
      accessibilityState={{ disabled: busy, busy }}
      disabled={busy}
      onPress={() => {
        void onPress();
      }}
      android_ripple={{ color: '#E8EAED' }}
      style={({ pressed }) => [styles.googleButton, { opacity: busy ? 0.65 : pressed ? 0.85 : 1 }]}
    >
      {busy ? (
        <ActivityIndicator size="small" color="#1F1F1F" />
      ) : (
        <Image
          source={require('../../../assets/google-g.png')}
          style={styles.googleIcon}
          accessible={false}
        />
      )}
      <Text style={styles.googleText}>Continuar con Google</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  decoration: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden' },
  corner: {
    position: 'absolute',
    top: -180,
    right: -200,
    width: 430,
    height: 430,
    borderRadius: 215,
    opacity: 0.65,
  },
  cornerOutline: {
    position: 'absolute',
    bottom: -210,
    left: -220,
    width: 410,
    height: 410,
    borderRadius: 205,
    borderWidth: 1,
  },
  scroll: { flexGrow: 1, paddingHorizontal: 28, paddingVertical: 28, alignItems: 'center' },
  content: { flex: 1, width: '100%', maxWidth: 420 },
  hero: {
    flex: 1,
    minHeight: 390,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 16,
    paddingBottom: 52,
  },
  emblemFrame: {
    width: 232,
    height: 222,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  emblem: { width: 232, height: 222, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: 196, height: 196, borderRadius: 98 },
  orbit: { position: 'absolute', width: 226, height: 226, borderRadius: 113, borderWidth: 1 },
  dot: {
    position: 'absolute',
    left: 20,
    top: 28,
    width: 12,
    height: 12,
    borderRadius: 6,
    opacity: 0.7,
  },
  title: {
    fontSize: 44,
    lineHeight: 54,
    fontWeight: '700',
    letterSpacing: -1.7,
    textAlign: 'center',
  },
  subtitle: { fontSize: 17, lineHeight: 26, textAlign: 'center', marginTop: 8 },
  actions: { gap: 14, paddingBottom: 18 },
  googleButton: {
    minHeight: 56,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#747775',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    overflow: 'hidden',
  },
  googleIcon: { width: 20, height: 20 },
  googleText: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '500',
    color: '#1F1F1F',
    textAlign: 'center',
    flexShrink: 1,
  },
});
