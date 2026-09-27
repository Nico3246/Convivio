import { Image, View } from 'react-native';
import { useTheme } from '../theme/provider';

/** The source retains the transparent margins required by Android's icon mask. */
export function BrandLogo({ size = 32 }: { size?: number }) {
  const { theme } = useTheme();
  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      <Image
        source={require('../../assets/convivio-logo.png')}
        resizeMode="contain"
        accessible={false}
        style={{ width: size * 1.65, height: size * 1.65, tintColor: theme.primary }}
      />
    </View>
  );
}
