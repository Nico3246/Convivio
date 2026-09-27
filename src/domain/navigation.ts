export const screens = [
  'home',
  'coexistence',
  'rules',
  'rule',
  'rule-form',
  'faults',
  'fault',
  'fault-new',
  'complaints',
  'complaint',
  'complaint-new',
  'visits',
  'visit',
  'visit-new',
  'reports',
  'report',
  'house',
  'tasks',
  'showers',
  'calendar',
  'shopping',
  'product',
  'product-new',
  'money',
  'expense',
  'expense-new',
  'payment-new',
  'profile',
  'notifications',
  'admin',
  'users',
  'delete-member',
  'invite',
  'task-config',
  'task-new',
  'shower-config',
  'shower-edit',
  'configuration',
  'audit',
] as const;
export type ScreenName = (typeof screens)[number];
export type Role = 'ADMIN' | 'RESIDENT' | 'CONTROLLER';
const administrative: readonly ScreenName[] = [
  'admin',
  'users',
  'delete-member',
  'invite',
  'rule-form',
  'task-config',
  'task-new',
  'shower-config',
  'shower-edit',
  'configuration',
  'audit',
];
const residential: readonly ScreenName[] = [
  'coexistence',
  'fault-new',
  'complaint-new',
  'visit-new',
  'house',
  'tasks',
  'showers',
  'calendar',
  'shopping',
  'product',
  'product-new',
  'money',
  'expense',
  'expense-new',
  'payment-new',
];
export function isScreen(value: unknown): value is ScreenName {
  return typeof value === 'string' && screens.includes(value as ScreenName);
}
export function canOpen(role: Role, screen: ScreenName): boolean {
  return administrative.includes(screen)
    ? role === 'ADMIN'
    : residential.includes(screen)
      ? role !== 'CONTROLLER'
      : true;
}
export const roleNames: Record<Role, string> = {
  ADMIN: 'Residente administrador',
  RESIDENT: 'Residente',
  CONTROLLER: 'Controlador',
};
