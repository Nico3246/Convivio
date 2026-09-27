import React from 'react';
import { create, act, type ReactTestRenderer, type ReactTestInstance } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ExpenseFormScreen } from '../src/features/money/screens';
import { FaultScreen, RuleScreen, VisitFormScreen } from '../src/features/coexistence/screens';
import { DeleteMemberScreen } from '../src/features/admin/screens';

const state = vi.hoisted(() => ({
  params: {} as Record<string, string>,
  role: 'ADMIN' as 'ADMIN' | 'RESIDENT' | 'CONTROLLER',
  data: {} as Record<string, Record<string, unknown>[]>,
  rpc: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  close: vi.fn(),
}));
const people = [
  {
    id: '20000000-0000-4000-8000-000000000001',
    household_id: '10000000-0000-4000-8000-000000000001',
    role: 'ADMIN',
    display_name: 'Alex',
    created_at: '2026-01-01Z',
  },
  {
    id: '20000000-0000-4000-8000-000000000002',
    household_id: '10000000-0000-4000-8000-000000000001',
    role: 'RESIDENT',
    display_name: 'Dani',
    created_at: '2026-01-01Z',
  },
  {
    id: '20000000-0000-4000-8000-000000000003',
    household_id: '10000000-0000-4000-8000-000000000001',
    role: 'CONTROLLER',
    display_name: 'Controlador',
    created_at: '2026-01-01Z',
  },
];
vi.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  Pressable: 'button',
  ScrollView: 'ScrollView',
  TextInput: 'input',
  ActivityIndicator: 'ActivityIndicator',
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  RefreshControl: 'RefreshControl',
  Image: 'Image',
  Platform: { OS: 'android' },
  StyleSheet: { create: (v: unknown) => v },
  useColorScheme: () => 'light',
  AppState: { currentState: 'active', addEventListener: () => ({ remove: () => undefined }) },
  Alert: { alert: vi.fn() },
}));
vi.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
vi.mock('@expo/vector-icons/Ionicons', () => ({ default: 'Icon' }));
vi.mock('../src/components/brand-logo', () => ({ BrandLogo: () => null }));
vi.mock('@react-native-community/datetimepicker', () => ({
  DateTimePickerAndroid: { open: vi.fn() },
}));
vi.mock('expo-secure-store', () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
}));
vi.mock('expo-crypto', async () => ({ randomUUID: (await import('node:crypto')).randomUUID }));
vi.mock('expo-router', () => ({
  useLocalSearchParams: () => state.params,
  useFocusEffect: () => undefined,
  router: { push: state.push, replace: state.replace, canGoBack: () => true, back: vi.fn() },
}));
vi.mock('../src/services/supabase', () => ({ supabase: () => ({}) }));
vi.mock('../src/features/auth/provider', () => ({
  useMember: () => ({
    member_id: people.find((p) => p.role === state.role)!.id,
    household_id: people[0]!.household_id,
    role: state.role,
    display_name: people.find((p) => p.role === state.role)!.display_name,
  }),
  useAuth: () => ({ member: { role: state.role }, closeLocally: state.close }),
}));
vi.mock('../src/services/api', async (original) => ({
  ...(await original<typeof import('../src/services/api')>()),
  call: state.rpc,
}));
vi.mock('../src/services/hooks', async (original) => ({
  ...(await original<typeof import('../src/services/hooks')>()),
  useRows: (table: string) => ({
    data: { rows: state.data[table] ?? [], count: state.data[table]?.length ?? 0 },
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
  useMembers: () => ({
    data: people,
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
}));
vi.mock('../src/features/photos/components', () => ({
  Attachments: () => null,
  PhotoPicker: () => null,
  usePhoto: () => ({ photo: null, setPhoto: vi.fn() }),
}));
vi.mock('../src/features/photos/service', () => ({ uploadPhoto: vi.fn() }));

let renderer: ReactTestRenderer;
let client: QueryClient;
const tree = (Component: React.ComponentType) => (
  <QueryClientProvider client={client}>
    <Component />
  </QueryClientProvider>
);
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  state.params = {};
  state.role = 'ADMIN';
  state.data = {};
  state.rpc.mockReset().mockResolvedValue('40000000-0000-4000-8000-000000000001');
  state.replace.mockClear();
  state.push.mockClear();
  state.close.mockClear();
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  client.clear();
});
const mount = async (Component: React.ComponentType) => {
  await act(async () => {
    renderer = create(tree(Component));
  });
};
const field = (label: string) =>
  renderer.root.findAllByType('input').find((n) => n.props.accessibilityLabel === label)!;
const contents = (node: ReactTestInstance): string =>
  node.children.map((c) => (typeof c === 'string' ? c : contents(c))).join('');
const button = (title: string) =>
  renderer.root
    .findAllByType('button')
    .find((n) => n.props.accessibilityRole === 'button' && contents(n) === title)!;
const press = async (title: string) => {
  const b = button(title);
  expect(b).toBeDefined();
  expect(b.props.disabled).toBe(false);
  await act(async () => {
    b.props.onPress();
  });
};
const fill = async (label: string, value: string) => {
  await act(async () => {
    field(label).props.onChangeText(value);
  });
};

test('el formulario aprobado calcula el céntimo y guarda ambos participantes', async () => {
  await mount(ExpenseFormScreen);
  await fill('Concepto', 'Supermercado');
  await fill('Importe (€)', '10,01');
  expect(contents(renderer.root)).toContain('5,01');
  await press('Registrar gasto');
  expect(state.rpc).toHaveBeenCalledWith(
    'save_expense',
    expect.objectContaining({
      p_payer: people[0]!.id,
      p_participants: [people[0]!.id, people[1]!.id],
      p_total_cents: 1001,
    }),
  );
  expect(state.replace).toHaveBeenCalledWith('/expense?id=40000000-0000-4000-8000-000000000001');
});
test('el formulario permite dejar solo al pagador y no inventa deuda', async () => {
  await mount(ExpenseFormScreen);
  await fill('Concepto', 'Compra personal');
  await fill('Importe (€)', '10,01');
  const checkbox = renderer.root
    .findAllByType('button')
    .find(
      (n) => n.props.accessibilityRole === 'checkbox' && n.props.accessibilityLabel === 'Dani',
    )!;
  await act(async () => checkbox.props.onPress());
  expect(contents(renderer.root)).toContain('no genera deuda');
  await press('Registrar gasto');
  expect(state.rpc).toHaveBeenCalledWith(
    'save_expense',
    expect.objectContaining({ p_participants: [people[0]!.id] }),
  );
});
test('un reintento tras error de red reutiliza el identificador y no navega antes de confirmar', async () => {
  state.rpc.mockRejectedValueOnce(new TypeError('network'));
  await mount(ExpenseFormScreen);
  await fill('Concepto', 'Compra');
  await fill('Importe (€)', '10');
  await press('Registrar gasto');
  expect(state.replace).not.toHaveBeenCalled();
  expect(contents(renderer.root)).toContain('No se ha podido confirmar');
  await press('Registrar gasto');
  expect(state.rpc.mock.calls[0]?.[1].p_request_id).toBe(state.rpc.mock.calls[1]?.[1].p_request_id);
  expect(state.replace).toHaveBeenCalledTimes(1);
});
test('una actualización de fondo no sobrescribe el formulario ni adelanta su versión', async () => {
  state.params = { id: '40000000-0000-4000-8000-000000000001' };
  state.data.debt_balances = [
    {
      id: state.params.id,
      current_version: 1,
      concept: 'Compra',
      total_cents: 1001,
      creditor_id: people[0]!.id,
      debtor_id: people[1]!.id,
      payer_participates: true,
      occurred_on: '2026-01-01',
      products: '',
    },
  ];
  await mount(ExpenseFormScreen);
  await fill('Importe (€)', '30');
  state.data.debt_balances = [
    { ...state.data.debt_balances[0], current_version: 2, total_cents: 2000 },
  ];
  await act(async () => renderer.update(tree(ExpenseFormScreen)));
  expect(field('Importe (€)').props.value).toBe('30');
  await fill('Motivo de la corrección', 'Importe equivocado');
  await press('Guardar corrección');
  expect(state.rpc).toHaveBeenCalledWith(
    'save_expense',
    expect.objectContaining({
      p_total_cents: 3000,
      p_expected_version: 1,
      p_reason: 'Importe equivocado',
    }),
  );
});
test('dos comentarios iguales confirmados son acciones distintas, no un reintento', async () => {
  state.params = { id: '40000000-0000-4000-8000-000000000001' };
  state.data.faults = [
    {
      id: state.params.id,
      responsible_id: people[1]!.id,
      reported_by: people[0]!.id,
      occurred_at: '2026-09-27T07:00:00Z',
      registered_at: '2026-09-27T08:00:00Z',
      description: 'Ruido',
      rule_version_id: '50000000-0000-4000-8000-000000000001',
      maintained_at: null,
    },
  ];
  await mount(FaultScreen);
  await fill('Añadir comentario', 'De acuerdo.');
  await press('Publicar comentario');
  expect(field('Añadir comentario').props.value).toBe('');
  await fill('Añadir comentario', 'De acuerdo.');
  await press('Publicar comentario');
  expect(state.rpc).toHaveBeenCalledTimes(2);
  expect(state.rpc.mock.calls[0]?.[1].p_request_id).not.toBe(
    state.rpc.mock.calls[1]?.[1].p_request_id,
  );
});
test('la excepción mantiene tipo, fechas y dos aprobaciones visibles', async () => {
  await mount(VisitFormScreen);
  expect(contents(renderer.root)).toContain('Dos aprobaciones necesarias');
  expect(contents(renderer.root)).toContain('Dani');
  expect(contents(renderer.root)).toContain('Controlador');
  await fill('Visitante', 'Una visita');
  await fill('Motivo', 'Celebración');
  await press('Enviar solicitud');
  expect(state.rpc).toHaveBeenCalledWith(
    'request_visit_exception',
    expect.objectContaining({
      p_kind: 'BOTH',
      p_visitor: 'Una visita',
      p_starts_at: expect.any(String),
      p_ends_at: expect.any(String),
    }),
  );
});
test('solo el controlador recibe los botones de resolver una propuesta', async () => {
  state.params = { id: '40000000-0000-4000-8000-000000000001' };
  state.data.latest_rules = [
    {
      id: 'version',
      rule_id: state.params.id,
      title: 'Norma',
      version: 1,
      description: 'Actual',
      category: 'HOURS',
      effective_at: '2026-01-01Z',
    },
  ];
  state.data.rule_versions = state.data.latest_rules;
  state.data.rule_proposals = [
    {
      id: '50000000-0000-4000-8000-000000000001',
      rule_id: state.params.id,
      title: 'Cambio',
      description: 'Propuesta',
      result: null,
      proposed_by: people[0]!.id,
    },
  ];
  state.role = 'RESIDENT';
  await mount(RuleScreen);
  expect(button('Aprobar cambio')).toBeUndefined();
  state.role = 'CONTROLLER';
  await act(async () => renderer.update(tree(RuleScreen)));
  await press('Aprobar cambio');
  expect(state.rpc).toHaveBeenCalledWith(
    'decide_rule_change',
    expect.objectContaining({
      p_decision: 'APPROVED',
      p_proposal: '50000000-0000-4000-8000-000000000001',
    }),
  );
});
test('el borrado del administrador exige el texto exacto y cierra la sesión tras confirmación del servidor', async () => {
  state.params = { id: people[0]!.id };
  state.rpc.mockResolvedValue({
    access_revoked: true,
    physical_cleanup_pending: true,
    household_deleted: true,
  });
  await mount(DeleteMemberScreen);
  expect(button('Eliminar piso definitivamente').props.disabled).toBe(true);
  await fill('Escribe ELIMINAR PISO para confirmar', 'ELIMINAR CUENTA');
  expect(button('Eliminar piso definitivamente').props.disabled).toBe(true);
  await fill('Escribe ELIMINAR PISO para confirmar', 'ELIMINAR PISO');
  await press('Eliminar piso definitivamente');
  expect(state.rpc).toHaveBeenCalledWith(
    'delete_account',
    expect.objectContaining({ p_member: people[0]!.id, p_confirmation: 'ELIMINAR PISO' }),
  );
  expect(state.close).toHaveBeenCalledTimes(1);
});
