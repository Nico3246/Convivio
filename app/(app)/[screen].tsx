import type { ComponentType } from 'react';
import { useLocalSearchParams, type ErrorBoundaryProps } from 'expo-router';
import { canOpen, isScreen, type ScreenName } from '../../src/domain/navigation';
import { useMember } from '../../src/features/auth/provider';
import { Shell, Notice, Button, go } from '../../src/components/ui';
import { HomeScreen } from '../../src/features/home/screens';
import {
  CoexistenceScreen,
  RulesScreen,
  RuleScreen,
  RuleFormScreen,
  FaultsScreen,
  FaultFormScreen,
  FaultScreen,
  ComplaintsScreen,
  ComplaintFormScreen,
  ComplaintScreen,
  VisitsScreen,
  VisitFormScreen,
  VisitScreen,
} from '../../src/features/coexistence/screens';
import {
  MoneyScreen,
  ExpenseScreen,
  ExpenseFormScreen,
  PaymentFormScreen,
} from '../../src/features/money/screens';
import {
  HouseScreen,
  TasksScreen,
  ShowersScreen,
  CalendarScreen,
  TaskConfigScreen,
  TaskFormScreen,
  ShowerConfigScreen,
  ShowerFormScreen,
} from '../../src/features/house/screens';
import {
  ShoppingScreen,
  ProductScreen,
  ProductFormScreen,
} from '../../src/features/shopping/screens';
import {
  AdminScreen,
  UsersScreen,
  InviteScreen,
  DeleteMemberScreen,
  ConfigurationScreen,
  AuditScreen,
} from '../../src/features/admin/screens';
import { ProfileScreen, NotificationsScreen } from '../../src/features/profile/screens';
import { ReportsScreen, ReportScreen } from '../../src/features/reports/screens';
const components: Record<ScreenName, ComponentType> = {
  home: HomeScreen,
  coexistence: CoexistenceScreen,
  rules: RulesScreen,
  rule: RuleScreen,
  'rule-form': RuleFormScreen,
  faults: FaultsScreen,
  fault: FaultScreen,
  'fault-new': FaultFormScreen,
  complaints: ComplaintsScreen,
  complaint: ComplaintScreen,
  'complaint-new': ComplaintFormScreen,
  visits: VisitsScreen,
  visit: VisitScreen,
  'visit-new': VisitFormScreen,
  reports: ReportsScreen,
  report: ReportScreen,
  house: HouseScreen,
  tasks: TasksScreen,
  showers: ShowersScreen,
  calendar: CalendarScreen,
  shopping: ShoppingScreen,
  product: ProductScreen,
  'product-new': ProductFormScreen,
  money: MoneyScreen,
  expense: ExpenseScreen,
  'expense-new': ExpenseFormScreen,
  'payment-new': PaymentFormScreen,
  profile: ProfileScreen,
  notifications: NotificationsScreen,
  admin: AdminScreen,
  users: UsersScreen,
  'delete-member': DeleteMemberScreen,
  invite: InviteScreen,
  'task-config': TaskConfigScreen,
  'task-new': TaskFormScreen,
  'shower-config': ShowerConfigScreen,
  'shower-edit': ShowerFormScreen,
  configuration: ConfigurationScreen,
  audit: AuditScreen,
};
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <Shell title="No se ha podido abrir la pantalla">
      <Notice>Se ha producido un error. Puedes reintentar o volver al inicio.</Notice>
      <Button title="Reintentar" onPress={retry} />
      <Button title="Volver al inicio" secondary onPress={() => go('home', {}, true)} />
    </Shell>
  );
}
export default function Screen() {
  const params = useLocalSearchParams(),
    member = useMember();
  const name = params.screen;
  if (!isScreen(name) || !canOpen(member.role, name))
    return (
      <Shell title="Pantalla no disponible">
        <Notice>Tu cuenta no puede acceder a esta pantalla.</Notice>
        <Button title="Volver al inicio" onPress={() => go('home', {}, true)} />
      </Shell>
    );
  const Component = components[name];
  return <Component key={JSON.stringify(params)} />;
}
