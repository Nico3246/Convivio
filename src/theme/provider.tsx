import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { palettes } from './tokens';
export type Appearance = 'system' | 'light' | 'dark';
function colors(dark: boolean) {
  return {
    ...palettes[dark ? 'dark' : 'light'],
    soft: dark ? '#29285C' : '#EEF2FF',
    danger: dark ? '#FCA5A5' : '#B91C1C',
    dangerBackground: dark ? '#3C1B29' : '#FFF1F2',
    dangerButton: dark ? '#991B1B' : '#B91C1C',
    success: dark ? '#86EFAC' : '#15803D',
    warning: dark ? '#FCD34D' : '#92400E',
    warningBackground: dark ? '#392C17' : '#FFFBEB',
  };
}
const Context = createContext<{
  theme: ReturnType<typeof colors>;
  appearance: Appearance;
  setAppearance: (value: Appearance) => void;
}>({ theme: colors(false), appearance: 'system', setAppearance: () => undefined });
export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [appearance, setMode] = useState<Appearance>('system');
  useEffect(() => {
    void SecureStore.getItemAsync('convivio.appearance')
      .then((value) => {
        if (value === 'light' || value === 'dark' || value === 'system') setMode(value);
      })
      .catch(() => undefined);
  }, []);
  const setAppearance = (value: Appearance) => {
    setMode(value);
    void SecureStore.setItemAsync('convivio.appearance', value).catch(() => undefined);
  };
  return (
    <Context.Provider
      value={{
        theme: colors(appearance === 'system' ? system === 'dark' : appearance === 'dark'),
        appearance,
        setAppearance,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useTheme = () => useContext(Context);
