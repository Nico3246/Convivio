import React from 'react';
import { Stack, Redirect } from 'expo-router';
import { act, create, type ReactTestRenderer, type ReactTestInstance } from 'react-test-renderer';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import AccessScreen from '../app/index';
import ProtectedLayout from '../app/(app)/_layout';
import { MotionProvider, useReducedMotion } from '../src/components/motion';

const state = vi.hoisted(() => ({
  loading: false,
  member: null as { role: string } | null,
  session: null as object | null,
  accessError: false,
  configured: true,
  busy: false,
  error: '',
  signIn: vi.fn(),
  refresh: vi.fn(),
  signOut: vi.fn(),
  motionQuery: vi.fn(),
  removeListener: vi.fn(),
  motionListener: undefined as ((value: boolean) => void) | undefined,
}));
vi.mock('react-native', () => ({
  AccessibilityInfo: {
    isReduceMotionEnabled: state.motionQuery,
    addEventListener: (_: string, listener: (value: boolean) => void) => {
      state.motionListener = listener;
      return { remove: state.removeListener };
    },
  },
}));
vi.mock('expo-router', () => ({ Stack: 'Stack', Redirect: 'Redirect' }));
vi.mock('../src/features/auth/provider', () => ({
  useAuth: () => ({ ...state, refresh: state.refresh, signOut: state.signOut }),
}));
vi.mock('../src/features/auth/service', () => ({ signInWithGoogle: state.signIn }));
vi.mock('../src/services/supabase', () => ({
  get isConfigured() {
    return state.configured;
  },
}));
vi.mock('../src/services/hooks', () => ({
  useCommand: () => ({
    busy: state.busy,
    error: state.error,
    run: (_: unknown, execute: () => unknown) => execute(),
  }),
}));
vi.mock('../src/theme/provider', () => ({
  useTheme: () => ({ theme: { background: '#F8FAFC' } }),
}));
vi.mock('../src/features/notifications/bridge', () => ({ NotificationBridge: () => null }));
vi.mock('../src/components/ui', () => ({
  Shell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Notice: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Loading: () => <span>Comprobando acceso</span>,
  ErrorText: ({ message }: { message: string }) => <span>{message}</span>,
  Button: ({ title, onPress }: { title: string; onPress: () => void }) => (
    <button onClick={onPress}>{title}</button>
  ),
}));
vi.mock('../src/features/auth/access-layout', () => ({
  AccessLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  GoogleButton: ({ onPress, busy }: { onPress: () => void; busy: boolean }) => (
    <button disabled={busy} onClick={onPress}>
      Continuar con Google
    </button>
  ),
}));

let renderer: ReactTestRenderer | undefined;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.assign(state, {
    loading: false,
    member: null,
    session: null,
    accessError: false,
    configured: true,
    busy: false,
    error: '',
  });
  state.signIn.mockReset();
  state.refresh.mockReset();
  state.signOut.mockReset();
  state.motionQuery.mockReset().mockResolvedValue(false);
  state.removeListener.mockClear();
});
afterEach(async () => {
  if (renderer) await act(async () => renderer!.unmount());
  renderer = undefined;
});
async function mount(element: React.ReactElement) {
  await act(async () => {
    renderer = create(element);
  });
}
const contents = (node: ReactTestInstance): string =>
  node.children.map((c) => (typeof c === 'string' ? c : contents(c))).join('');
const text = () => contents(renderer!.root);
const button = (label: string) =>
  renderer!.root.findAllByType('button').find((n) => contents(n) === label)!;

test('el login simplificado sigue ejecutando el acceso Google existente y muestra sus errores', async () => {
  await mount(<AccessScreen />);
  expect(renderer!.root.findAllByType('button')).toHaveLength(1);
  await act(async () => button('Continuar con Google').props.onClick());
  expect(state.signIn).toHaveBeenCalledOnce();
  state.error = 'No se ha podido completar el acceso.';
  state.busy = true;
  await act(async () => renderer!.update(<AccessScreen />));
  expect(text()).toContain(state.error);
  expect(button('Continuar con Google').props.disabled).toBe(true);
});

test('sin pertenencia se conserva reintentar y cambiar de cuenta, nunca se abre el piso', async () => {
  state.session = {};
  await mount(<AccessScreen />);
  expect(text()).toContain('Esta cuenta no tiene acceso');
  expect(renderer!.root.findAllByType(Redirect)).toHaveLength(0);
  await act(async () => button('Comprobar acceso').props.onClick());
  await act(async () => button('Cambiar de cuenta').props.onClick());
  expect(state.refresh).toHaveBeenCalledOnce();
  expect(state.signOut).toHaveBeenCalledOnce();
  state.accessError = true;
  await act(async () => renderer!.update(<AccessScreen />));
  expect(text()).toContain('No se ha podido comprobar tu acceso');
});

test('no se ofrece Google antes de configurar la app ni durante la comprobación de sesión', async () => {
  state.configured = false;
  await mount(<AccessScreen />);
  expect(text()).toContain('completar la configuración');
  expect(renderer!.root.findAllByType('button')).toHaveLength(0);
  state.loading = true;
  await act(async () => renderer!.update(<AccessScreen />));
  expect(text()).toContain('Comprobando acceso');
  expect(renderer!.root.findAllByType('button')).toHaveLength(0);
});

test('solo una sesión con pertenencia accede al nuevo navegador, y la revocación lo desmonta', async () => {
  await mount(<ProtectedLayout />);
  expect(renderer!.root.findAllByType(Stack)).toHaveLength(0);
  expect(renderer!.root.findByType(Redirect).props.href).toBe('/');
  state.member = { role: 'ADMIN' };
  await act(async () => renderer!.update(<ProtectedLayout />));
  expect(renderer!.root.findAllByType(Stack)).toHaveLength(1);
  await act(async () => renderer!.update(<AccessScreen />));
  expect(renderer!.root.findByType(Redirect).props.href).toBe('/home');
  state.member = null;
  await act(async () => renderer!.update(<ProtectedLayout />));
  expect(renderer!.root.findAllByType(Stack)).toHaveLength(0);
});

test('el navegador anima secciones y detalles, y desactiva ambas transiciones al reducir movimiento', async () => {
  state.member = { role: 'RESIDENT' };
  await mount(
    <MotionProvider>
      <ProtectedLayout />
    </MotionProvider>,
  );
  let options = renderer!.root.findByType(Stack).props.screenOptions;
  expect(options({ route: { params: { route: 'money' } } }).animation).toBe('fade');
  expect(options({ route: { params: { route: 'expense', id: 'expense-1' } } }).animation).toBe(
    'slide_from_right',
  );
  await act(async () => state.motionListener!(true));
  options = renderer!.root.findByType(Stack).props.screenOptions;
  expect(options({ route: { params: { route: 'money' } } }).animation).toBe('none');
  expect(options({ route: { params: { route: 'expense' } } }).animation).toBe('none');
});

test('un cambio reciente de accesibilidad prevalece sobre una consulta inicial tardía', async () => {
  let resolve!: (value: boolean) => void;
  state.motionQuery.mockImplementation(
    () =>
      new Promise<boolean>((done) => {
        resolve = done;
      }),
  );
  function Preference() {
    return <span>{useReducedMotion() ? 'quieto' : 'animado'}</span>;
  }
  await mount(
    <MotionProvider>
      <Preference />
    </MotionProvider>,
  );
  expect(text()).toBe('quieto');
  await act(async () => state.motionListener!(true));
  await act(async () => resolve(false));
  expect(text()).toBe('quieto');
  await act(async () => renderer!.unmount());
  renderer = undefined;
  expect(state.removeListener).toHaveBeenCalledOnce();
});
