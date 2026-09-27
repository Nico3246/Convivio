import React from 'react';
import { Modal } from 'react-native';
import { act, create, type ReactTestRenderer, type ReactTestInstance } from 'react-test-renderer';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  calendarDays,
  startOfWeek,
  weekLabel,
  type CalendarTask,
  type CalendarShower,
} from '../src/features/house/calendar-model';
import { loadCalendarRows } from '../src/features/house/calendar-data';
import { WeeklyCalendar } from '../src/features/house/weekly-calendar';

const state = vi.hoisted(() => ({ list: vi.fn(), scrollTo: vi.fn(), reduced: false }));
vi.mock('../src/services/api', () => ({ list: state.list, AppError: class extends Error {} }));
vi.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  Pressable: 'button',
  ScrollView: 'ScrollView',
  Modal: 'Modal',
  StyleSheet: { create: (value: unknown) => value },
  useWindowDimensions: () => ({ width: 393, height: 852, fontScale: 1 }),
}));
vi.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
vi.mock('../src/components/motion', () => ({ useReducedMotion: () => state.reduced }));
vi.mock('../src/theme/provider', () => ({
  useTheme: () => ({ theme: { primary: '#4F46E5', background: '#F8FAFC' } }),
}));
vi.mock('../src/components/ui', () => ({
  Section: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Card: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Copy: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Heading: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Icon: () => null,
  Button: ({ title, onPress }: { title: string; onPress: () => void }) => (
    <button onClick={onPress}>{title}</button>
  ),
}));

const task = (overrides: Partial<CalendarTask> = {}): CalendarTask => ({
  id: 'task-1',
  household_id: 'home',
  template_id: 'template-1',
  assigned_to: 'alex',
  due_date: '2026-09-23',
  due_time: '09:00:00',
  completed_by: null,
  completed_at: null,
  created_at: '2026-09-01T00:00:00Z',
  title: 'Limpiar cocina',
  description: '',
  zone: 'Cocina',
  kind: 'CLEANING',
  alternate: true,
  ...overrides,
});
const shower = (overrides: Partial<CalendarShower> = {}): CalendarShower => ({
  id: 'shower-1',
  household_id: 'home',
  created_by: 'alex',
  resident_id: 'dani',
  weekday: 3,
  starts_at: '07:00:00',
  ends_at: '07:30:00',
  revision: 1,
  ...overrides,
});

let renderer: ReactTestRenderer | undefined;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  state.list.mockReset();
  state.scrollTo.mockReset();
  state.reduced = false;
});
afterEach(async () => {
  if (renderer) await act(async () => renderer!.unmount());
  renderer = undefined;
});

test('la semana empieza en lunes, también al cruzar año y cambio de hora', () => {
  expect(startOfWeek('2026-09-27')).toBe('2026-09-21');
  expect(startOfWeek('2026-01-01')).toBe('2025-12-29');
  expect(calendarDays(startOfWeek('2026-03-29'), [], []).map((day) => day.day)).toEqual([
    '2026-03-23',
    '2026-03-24',
    '2026-03-25',
    '2026-03-26',
    '2026-03-27',
    '2026-03-28',
    '2026-03-29',
  ]);
  expect(weekLabel('2025-12-29')).toMatch(/2025.*2026/);
});

test('mantiene las fechas de tareas pendientes y realizadas, sin trasladarlas a hoy', () => {
  const pending = task({ due_date: '2026-09-21' });
  const completed = task({
    id: 'task-2',
    due_date: '2026-09-22',
    completed_at: '2026-09-23T08:00:00Z',
  });
  const days = calendarDays(
    '2026-09-21',
    [pending, completed, task({ id: 'outside', due_date: '2026-09-28' })],
    [],
  );
  expect(days[0]!.timed[0]).toMatchObject({ task: pending });
  expect(days[1]!.timed[0]).toMatchObject({ task: completed });
  expect(days.flatMap((day) => day.timed)).toHaveLength(2);
});

test('separa tareas sin hora, mantiene medianoche y conserva eventos simultáneos', () => {
  const days = calendarDays(
    '2026-09-21',
    [
      task(),
      task({ id: 'untimed', due_time: null }),
      task({ id: 'midnight', due_time: '00:00:00' }),
    ],
    [shower(), shower({ id: 'same-time', starts_at: '09:00:00', ends_at: '09:30:00' })],
  );
  const day = days[2]!;
  expect(day.untimed.map((entry) => entry.key)).toEqual(['task:untimed']);
  expect(day.timed.map((entry) => entry.time)).toEqual(['00:00', '07:00', '09:00', '09:00']);
  expect(new Set(day.timed.map((entry) => entry.key)).size).toBe(4);
});

test('los turnos habituales de ducha aparecen en su día de la semana', () => {
  const days = calendarDays('2026-09-21', [], [shower({ weekday: 7 })]);
  expect(days[6]!.timed[0]).toMatchObject({ kind: 'shower', day: '2026-09-27' });
  expect(days.slice(0, 6).flatMap((day) => day.timed)).toHaveLength(0);
});

test('carga la semana completa aunque supere una página y el servidor reduzca su tamaño', async () => {
  const rows = Array.from({ length: 205 }, (_, index) =>
    task({ id: String(index).padStart(4, '0') }),
  );
  state.list.mockImplementation(async (_table, _household, options) => {
    const cursor = options.filters.find(
      (filter: { column: string }) => filter.column === 'id',
    )?.value;
    const remaining = rows.filter((row) => !cursor || row.id > cursor);
    return { rows: remaining.slice(0, 80), count: remaining.length };
  });
  const filters = [{ column: 'due_date', operator: 'gte' as const, value: '2026-09-21' }];
  const signal = new AbortController().signal;
  expect(await loadCalendarRows('scheduled_tasks', 'home', filters, signal)).toEqual(rows);
  expect(state.list).toHaveBeenCalledTimes(3);
  for (const [table, household, options, requestSignal] of state.list.mock.calls) {
    expect(table).toBe('scheduled_tasks');
    expect(household).toBe('home');
    expect(options.filters).toEqual(expect.arrayContaining(filters));
    expect(requestSignal).toBe(signal);
  }
});

test('una página fallida no convierte un calendario incompleto en resultado correcto', async () => {
  state.list
    .mockResolvedValueOnce({ rows: [task()], count: 2 })
    .mockRejectedValueOnce(new Error('Sin conexión'));
  await expect(
    loadCalendarRows('scheduled_tasks', 'home', [], new AbortController().signal),
  ).rejects.toThrow('Sin conexión');
});

test('abandonar la consulta impide pedir más páginas', async () => {
  const controller = new AbortController();
  state.list.mockImplementationOnce(async () => {
    controller.abort();
    return { rows: [task()], count: 2 };
  });
  await expect(loadCalendarRows('scheduled_tasks', 'home', [], controller.signal)).rejects.toThrow(
    'cancelada',
  );
  expect(state.list).toHaveBeenCalledOnce();
});

const props = () => ({
  start: '2026-09-21',
  today: '2026-09-23',
  tasks: [task()],
  showers: [shower()],
  name: (id: string) => (id === 'alex' ? 'Alex' : 'Dani'),
  onChangeWeek: vi.fn(),
  renderTask: (value: CalendarTask) => (
    <span>
      {value.title}: {value.completed_at ? 'Completada' : 'Pendiente'}
    </span>
  ),
});
async function mount(value = props()) {
  await act(async () => {
    renderer = create(<WeeklyCalendar {...value} />, {
      createNodeMock: (element) =>
        element.type === 'ScrollView' ? { scrollTo: state.scrollTo } : null,
    });
  });
  return value;
}
const contents = (node: ReactTestInstance): string =>
  node.children.map((child) => (typeof child === 'string' ? child : contents(child))).join('');
const button = (label: string) =>
  renderer!.root
    .findAllByType('button')
    .find((node) => node.props.accessibilityLabel === label || contents(node) === label)!;

test('anterior, siguiente y Hoy eligen semanas completas y limitan el futuro programado', async () => {
  const value = await mount();
  await act(async () => button('Semana anterior').props.onPress());
  expect(value.onChangeWeek).toHaveBeenLastCalledWith('2026-09-14');
  await act(async () => button('Semana siguiente').props.onPress());
  expect(value.onChangeWeek).toHaveBeenLastCalledWith('2026-09-28');
  await act(async () => button('Hoy').props.onPress());
  expect(value.onChangeWeek).toHaveBeenLastCalledWith('2026-09-21');
  expect(state.scrollTo).toHaveBeenLastCalledWith({ x: 136, animated: true });
  await act(async () => renderer!.update(<WeeklyCalendar {...value} start="2026-10-05" />));
  expect(button('Semana siguiente').props.disabled).toBe(true);
});

test('el detalle usa la tarea actualizada y cierra al volver o eliminar el evento', async () => {
  const value = await mount();
  const event = renderer!.root
    .findAllByType('button')
    .find((node) => node.props.accessibilityLabel?.startsWith('Limpiar cocina.'))!;
  await act(async () => event.props.onPress());
  expect(renderer!.root.findByType(Modal).props.visible).toBe(true);
  expect(contents(renderer!.root.findByType(Modal))).toContain('Limpiar cocina: Pendiente');
  await act(async () =>
    renderer!.update(
      <WeeklyCalendar {...value} tasks={[task({ completed_at: '2026-09-23T08:00:00Z' })]} />,
    ),
  );
  expect(contents(renderer!.root.findByType(Modal))).toContain('Limpiar cocina: Completada');
  await act(async () => renderer!.root.findByType(Modal).props.onRequestClose());
  expect(renderer!.root.findByType(Modal).props.visible).toBe(false);
  await act(async () => event.props.onPress());
  await act(async () => renderer!.update(<WeeklyCalendar {...value} tasks={[]} />));
  expect(renderer!.root.findByType(Modal).props.visible).toBe(false);
});

test('las duchas muestran su horario y respetan reducir movimiento al abrir y volver a Hoy', async () => {
  state.reduced = true;
  await mount();
  const event = renderer!.root
    .findAllByType('button')
    .find((node) => node.props.accessibilityLabel?.startsWith('Ducha.'))!;
  await act(async () => event.props.onPress());
  const modal = renderer!.root.findByType(Modal);
  expect(modal.props.animationType).toBe('none');
  expect(contents(modal)).toContain('07:00–07:30');
  expect(contents(modal)).toContain('Dani');
  await act(async () => button('Cerrar').props.onClick());
  expect(renderer!.root.findByType(Modal).props.visible).toBe(false);
  await act(async () => button('Hoy').props.onPress());
  expect(state.scrollTo).toHaveBeenLastCalledWith({ x: 136, animated: false });
});
