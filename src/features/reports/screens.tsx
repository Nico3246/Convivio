import { useState, type ReactNode } from 'react';
import {
  Shell,
  Card,
  Copy,
  Heading,
  Button,
  Badge,
  Empty,
  QueryState,
  Pager,
  Notice,
  go,
} from '../../components/ui';
import { useMember } from '../auth/provider';
import { useRows } from '../../services/hooks';
import { displayDay, displayInstant } from '../../domain/dates';
import { formatEuro } from '../../domain/money';
import { useDetail, useId, usePeople } from '../shared';
import { Balance } from '../money/screens';
import { days } from '../house/screens';
import type { Relation, Row } from '../../services/database.types';

export function ReportsScreen() {
  const [page, setPage] = useState(0);
  const query = useRows('weekly_reports', { order: 'ends_at', page });
  return (
    <Shell title="Resúmenes semanales" back refresh={query.refetch}>
      <Copy muted>Cierre cada sábado a las 12:00, hora de Madrid.</Copy>
      <QueryState query={query}>
        {!query.data?.rows.length && <Empty text="Todavía no hay informes generados." />}
        {query.data?.rows.map((r) => (
          <Card key={r.id} onPress={() => go('report', { id: r.id })}>
            <Heading>Resumen · {displayInstant(r.ends_at)}</Heading>
            <Copy muted>Desde {displayInstant(r.starts_at)}</Copy>
          </Card>
        ))}
        <Pager page={page} count={query.data?.count ?? 0} onChange={setPage} />
      </QueryState>
    </Shell>
  );
}
function RecordCard<T extends Exclude<Relation, 'members'>>({
  table,
  id,
  children,
}: {
  table: T;
  id: string;
  children: (row: Row<T>) => ReactNode;
}) {
  const query = useDetail(table, id);
  return (
    <QueryState query={query}>
      {query.data?.rows[0] ? (
        children(query.data.rows[0])
      ) : (
        <Empty text="Este registro ya no está disponible." />
      )}
    </QueryState>
  );
}
function FaultEntry({ id }: { id: string }) {
  const people = usePeople(),
    query = useDetail('faults', id),
    f = query.data?.rows[0];
  const rule = useDetail(
    'rule_versions',
    f?.rule_version_id ?? '00000000-0000-4000-8000-000000000000',
  );
  return (
    <QueryState query={query}>
      {f && (
        <Card>
          <Badge>Falta</Badge>
          <Heading>{people.name(f.responsible_id)}</Heading>
          <QueryState query={rule}>
            <Copy strong>{rule.data?.rows[0]?.title ?? 'Norma no disponible'}</Copy>
          </QueryState>
          <Copy>{f.description}</Copy>
          <Copy muted>Ocurrió: {displayInstant(f.occurred_at)}</Copy>
          <Copy muted>Se registró: {displayInstant(f.registered_at)}</Copy>
          <Button
            title="Consultar falta, fotografías y comentarios"
            secondary
            onPress={() => go('fault', { id })}
          />
        </Card>
      )}
    </QueryState>
  );
}
function Entry({ entry, end }: { entry: Row<'report_entries'>; end: string }) {
  const people = usePeople();
  if (entry.fault_id) return <FaultEntry id={entry.fault_id} />;
  if (entry.comment_id)
    return (
      <RecordCard table="fault_comments" id={entry.comment_id}>
        {(c) => (
          <Card>
            <Badge>Comentario en una falta</Badge>
            <Copy strong>{people.name(c.author_id)}</Copy>
            <Copy>{c.body}</Copy>
            <Copy muted>{displayInstant(c.created_at)}</Copy>
            <Button
              title="Consultar falta"
              secondary
              onPress={() => go('fault', { id: c.fault_id })}
            />
          </Card>
        )}
      </RecordCard>
    );
  if (entry.complaint_id)
    return (
      <RecordCard table="complaints" id={entry.complaint_id}>
        {(c) => (
          <Card>
            <Badge>Queja</Badge>
            <Heading>{c.title}</Heading>
            <Copy>{c.description}</Copy>
            <Copy muted>
              {people.name(c.author_id)} · {displayInstant(c.created_at)}
            </Copy>
            <Copy>{c.target_id ? `Dirigida a ${people.name(c.target_id)}` : 'Queja general'}</Copy>
            <Button
              title="Consultar queja y fotografías"
              secondary
              onPress={() => go('complaint', { id: c.id })}
            />
          </Card>
        )}
      </RecordCard>
    );
  if (entry.deletion_event_id)
    return (
      <RecordCard table="fault_deletion_events" id={entry.deletion_event_id}>
        {(e) => (
          <Notice>
            Se eliminó definitivamente una falta informada. {people.name(e.deleted_by)} ·{' '}
            {displayInstant(e.deleted_at)}. Su contenido ya no se conserva.
          </Notice>
        )}
      </RecordCard>
    );
  if (entry.task_id)
    return (
      <RecordCard table="scheduled_tasks" id={entry.task_id}>
        {(t) => (
          <Card>
            <Badge>Tarea</Badge>
            <Heading>{t.title}</Heading>
            <Copy>
              {people.name(t.assigned_to)} · {displayDay(t.due_date)}
            </Copy>
            <Copy>
              {t.completed_at && new Date(t.completed_at) < new Date(end)
                ? 'Completada antes del cierre'
                : 'Pendiente al cierre'}
            </Copy>
            {t.completed_at && new Date(t.completed_at) >= new Date(end) && (
              <Copy muted>Completada después: {displayInstant(t.completed_at)}</Copy>
            )}
            <Button title="Consultar tareas" secondary onPress={() => go('tasks')} />
          </Card>
        )}
      </RecordCard>
    );
  if (entry.debt_version_id)
    return (
      <RecordCard table="debt_versions" id={entry.debt_version_id}>
        {(v) => (
          <Card>
            <Badge>Movimiento · versión {v.version}</Badge>
            <Heading>
              {v.concept} · {formatEuro(v.total_cents)}
            </Heading>
            <Copy>
              {people.name(v.creditor_id)}
              {v.debtor_id
                ? ` · ${people.name(v.debtor_id)} debe ${formatEuro(v.debt_cents)}`
                : ' · sin deuda'}
            </Copy>
            <Copy>Fecha del movimiento: {displayDay(v.occurred_on)}</Copy>
            <Copy muted>
              Registrado {displayInstant(v.created_at)} por {people.name(v.recorded_by)}
            </Copy>
            {v.correction_reason && <Copy>Corrección: {v.correction_reason}</Copy>}
            <Button
              title="Consultar historial y estado actual"
              secondary
              onPress={() => go('expense', { id: v.debt_id })}
            />
          </Card>
        )}
      </RecordCard>
    );
  if (entry.payment_version_id)
    return (
      <RecordCard table="payment_versions" id={entry.payment_version_id}>
        {(v) => (
          <Card>
            <Badge>Pago · versión {v.version}</Badge>
            <Heading>{formatEuro(v.amount_cents)}</Heading>
            <Copy>Fecha del pago: {displayDay(v.occurred_on)}</Copy>
            <Copy muted>
              Registrado {displayInstant(v.created_at)} por {people.name(v.recorded_by)}
            </Copy>
            {v.correction_reason && <Copy>Corrección: {v.correction_reason}</Copy>}
            <Button
              title="Consultar deuda e historial"
              secondary
              onPress={() => go('expense', { id: v.debt_id })}
            />
          </Card>
        )}
      </RecordCard>
    );
  if (entry.shower_version_id)
    return (
      <RecordCard table="shower_versions" id={entry.shower_version_id}>
        {(s) => (
          <Card>
            <Badge>Turno de ducha al cierre</Badge>
            <Heading>{days.find((d) => Number(d.value) === s.weekday)?.label}</Heading>
            <Copy>
              {s.starts_at.slice(0, 5)}–{s.ends_at.slice(0, 5)} · {people.name(s.resident_id)}
            </Copy>
          </Card>
        )}
      </RecordCard>
    );
  if (entry.shopping_item_id)
    return (
      <RecordCard table="shopping_items" id={entry.shopping_item_id}>
        {(s) => (
          <Card>
            <Badge>
              Compra ·{' '}
              {s.scope === 'PERSONAL' ? 'Personal' : s.scope === 'SHARED' ? 'Compartida' : 'Hogar'}
            </Badge>
            <Heading>{s.name}</Heading>
            <Copy>
              {s.quantity} {s.unit} ·{' '}
              {s.purchased_at && new Date(s.purchased_at) < new Date(end)
                ? 'Comprado antes del cierre'
                : 'Pendiente al cierre'}
            </Copy>
            <Button
              title="Consultar producto"
              secondary
              onPress={() => go('product', { id: s.id, kind: 'LIST' })}
            />
          </Card>
        )}
      </RecordCard>
    );
  return null;
}
export function ReportScreen() {
  const id = useId(),
    member = useMember();
  const [page, setPage] = useState(0);
  const query = useDetail('weekly_reports', id),
    report = query.data?.rows[0];
  const entries = useRows('report_entries', {
    filters: [{ column: 'report_id', value: id }],
    order: 'id',
    ascending: true,
    page,
    size: 20,
  });
  return (
    <Shell title="Resumen semanal" back refresh={query.refetch}>
      <QueryState query={query}>
        {!report ? (
          <Empty text="Este informe no está disponible." />
        ) : (
          <>
            <Card>
              <Copy>Desde {displayInstant(report.starts_at)}</Copy>
              <Copy>Hasta {displayInstant(report.ends_at)}</Copy>
              <Copy muted>Generado {displayInstant(report.generated_at)}</Copy>
            </Card>
            <Notice>
              Las novedades se incluyen por su fecha de registro. Los importes conservan la versión
              informada. Las bajas y eliminaciones definitivas retiran los datos relacionados.
            </Notice>
            {member.role !== 'CONTROLLER' && <Balance report={id} />}
            <QueryState query={entries}>
              {!entries.data?.rows.length && (
                <Empty text="No hay entradas disponibles para este periodo." />
              )}
              {entries.data?.rows.map((e) => (
                <Entry key={e.id} entry={e} end={report.ends_at} />
              ))}
              <Pager page={page} count={entries.data?.count ?? 0} onChange={setPage} size={20} />
            </QueryState>
          </>
        )}
      </QueryState>
    </Shell>
  );
}
