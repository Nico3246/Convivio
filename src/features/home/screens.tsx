import {
  Shell,
  Card,
  Copy,
  Heading,
  Button,
  QueryState,
  Empty,
  Notice,
  go,
} from '../../components/ui';
import { useMember } from '../auth/provider';
import { useClock, useRows } from '../../services/hooks';
import { displayInstant } from '../../domain/dates';
import { Balance } from '../money/screens';

export function HomeScreen() {
  const member = useMember();
  return member.role === 'CONTROLLER' ? <ControllerHome /> : <ResidentHome />;
}
function LatestReport() {
  const query = useRows('weekly_reports', { order: 'ends_at', size: 1 });
  const report = query.data?.rows[0];
  return (
    <QueryState query={query}>
      {report ? (
        <Card onPress={() => go('report', { id: report.id })}>
          <Heading>Resumen semanal</Heading>
          <Copy muted>Cierre: {displayInstant(report.ends_at)}</Copy>
          <Copy>Consultar informe</Copy>
        </Card>
      ) : (
        <Empty text="El primer resumen estará disponible después del cierre del sábado a las 12:00." />
      )}
      <Button title="Informes anteriores" secondary onPress={() => go('reports')} />
    </QueryState>
  );
}
function ResidentHome() {
  const member = useMember();
  const tasks = useRows('scheduled_tasks', {
    filters: [
      { column: 'assigned_to', value: member.member_id },
      { column: 'completed_at', operator: 'is', value: null },
    ],
    order: 'due_date',
    ascending: true,
    size: 1,
  });
  const visits = useRows('visit_exceptions', {
    filters: [{ column: 'status', value: 'PENDING' }],
    size: 1,
  });
  return (
    <Shell title={`Hola, ${member.display_name}`} active="home" subtitle="Tu convivencia, al día">
      <Balance />
      <QueryState query={tasks}>
        <Card onPress={() => go('tasks')}>
          <Heading>{tasks.data?.count ?? 0} tareas pendientes</Heading>
          <Copy>{tasks.data?.rows[0]?.title ?? 'No tienes tareas pendientes.'}</Copy>
        </Card>
      </QueryState>
      <QueryState query={visits}>
        <Card onPress={() => go('visits')}>
          <Heading>{visits.data?.count ?? 0} excepciones pendientes</Heading>
          <Copy>Consultar solicitudes de visitas</Copy>
        </Card>
      </QueryState>
      <Button title="Registrar una falta" secondary onPress={() => go('fault-new')} />
      <LatestReport />
    </Shell>
  );
}
function ControllerHome() {
  const member = useMember(),
    now = useClock();
  const faults = useRows('faults', {
    filters: [{ column: 'maintained_at', operator: 'is', value: null }],
    order: 'registered_at',
    size: 1,
  });
  const visits = useRows('visit_exceptions', {
    filters: [
      { column: 'status', value: 'PENDING' },
      { column: 'controller_decision', operator: 'is', value: null },
      { column: 'ends_at', operator: 'gt', value: new Date(now).toISOString() },
    ],
    size: 1,
  });
  const changes = useRows('rule_proposals', {
    filters: [{ column: 'result', operator: 'is', value: null }],
    size: 1,
  });
  return (
    <Shell title="Resumen de convivencia" active="home" subtitle={member.display_name}>
      <QueryState query={faults}>
        <Card onPress={() => go('faults')}>
          <Heading>{faults.data?.count ?? 0} faltas por revisar</Heading>
          <Copy>Consultar faltas y pruebas</Copy>
        </Card>
      </QueryState>
      <QueryState query={visits}>
        <Card onPress={() => go('visits')}>
          <Heading>{visits.data?.count ?? 0} excepciones pendientes</Heading>
          <Copy>Solicitudes que requieren tu decisión</Copy>
        </Card>
      </QueryState>
      <QueryState query={changes}>
        <Card onPress={() => go('rules')}>
          <Heading>Normas y cambios</Heading>
          <Copy>{changes.data?.count ?? 0} propuestas pendientes</Copy>
        </Card>
      </QueryState>
      <LatestReport />
      <Notice>Las faltas y quejas se reúnen en el resumen semanal, sin avisos inmediatos.</Notice>
    </Shell>
  );
}
