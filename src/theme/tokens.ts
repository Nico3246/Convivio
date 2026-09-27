export const palettes = {
  light: {
    background: '#F8FAFC',
    card: '#FFFFFF',
    text: '#0F172A',
    secondary: '#475569',
    border: '#E2E8F0',
    primary: '#4F46E5',
    onPrimary: '#FFFFFF',
  },
  dark: {
    background: '#0F172A',
    card: '#1E293B',
    text: '#F8FAFC',
    secondary: '#CBD5E1',
    border: '#334155',
    primary: '#6366F1',
    onPrimary: '#FFFFFF',
  },
} as const;
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radii = { button: 12, card: 16, modal: 20 } as const;
