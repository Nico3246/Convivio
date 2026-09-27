import { expect, test } from 'vitest';
import { canOpen, isScreen, screens } from '../src/domain/navigation';
import { dateOnly, localDateTime, shiftDay, timeOnly, weekday } from '../src/domain/dates';
import { expenseSplit } from '../src/domain/money';
test('el controlador no accede a economía, productos, tareas ni administración desde enlaces', () => {
  for (const route of [
    'money',
    'expense',
    'expense-new',
    'payment-new',
    'house',
    'tasks',
    'showers',
    'calendar',
    'shopping',
    'product',
    'product-new',
    'admin',
    'users',
    'delete-member',
    'invite',
    'rule-form',
  ] as const)
    expect(canOpen('CONTROLLER', route)).toBe(false);
  for (const route of [
    'home',
    'rules',
    'rule',
    'faults',
    'fault',
    'complaints',
    'complaint',
    'visits',
    'visit',
    'reports',
    'report',
  ] as const)
    expect(canOpen('CONTROLLER', route)).toBe(true);
  expect(isScreen('arbitrary-route')).toBe(false);
});
test('el residente no puede abrir administración; el admin conserva funciones residenciales', () => {
  expect(canOpen('RESIDENT', 'delete-member')).toBe(false);
  expect(canOpen('RESIDENT', 'rule-form')).toBe(false);
  expect(screens.every((route) => canOpen('ADMIN', route))).toBe(true);
});
test('fechas civiles de Madrid atraviesan los cambios de hora sin desplazar el día', () => {
  expect(localDateTime('2026-03-29', '01:30').toISOString()).toBe('2026-03-29T00:30:00.000Z');
  expect(() => localDateTime('2026-03-29', '02:30')).toThrow('no existe');
  expect(localDateTime('2026-03-29', '03:30').toISOString()).toBe('2026-03-29T01:30:00.000Z');
  expect(localDateTime('2026-10-25', '02:30').toISOString()).toBe('2026-10-25T00:30:00.000Z');
  expect(dateOnly(new Date('2026-09-25T23:30Z'))).toBe('2026-09-26');
  expect(timeOnly(new Date('2026-09-25T23:30Z'))).toBe('01:30');
  expect(shiftDay('2026-03-28', 1)).toBe('2026-03-29');
  expect(weekday('2026-09-28')).toBe(1);
});
test('el formulario muestra el mismo reparto en los tres casos aprobados', () => {
  expect(expenseSplit(1001, 'A', ['A', 'B'])).toMatchObject({
    debtCents: 501,
    payerCents: 500,
    debtorId: 'B',
  });
  expect(expenseSplit(1001, 'A', ['A'])).toMatchObject({
    debtCents: 0,
    payerCents: 1001,
    debtorId: null,
  });
  expect(expenseSplit(1001, 'A', ['B'])).toMatchObject({
    debtCents: 1001,
    payerCents: 0,
    debtorId: 'B',
  });
  expect(() => expenseSplit(1001, 'A', [])).toThrow();
});
