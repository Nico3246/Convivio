import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Shell,
  Section,
  Card,
  Copy,
  Heading,
  Button,
  Choices,
  Check,
  Field,
  DateField,
  Badge,
  Empty,
  ErrorText,
  QueryState,
  Pager,
  Row as LayoutRow,
  Notice,
  go,
} from '../../components/ui';
import { useMember } from '../auth/provider';
import { useCommand, useRows } from '../../services/hooks';
import { AppError, call } from '../../services/api';
import { dateOnly, displayDay, displayInstant, shiftDay, weekday } from '../../domain/dates';
import { required, useDetail, useId, useParam, usePeople } from '../shared';
import type { Row } from '../../services/database.types';

export const days = [
  { value: '1', label: 'Lunes' },
  { value: '2', label: 'Martes' },
  { value: '3', label: 'Miércoles' },
  { value: '4', label: 'Jueves' },
  { value: '5', label: 'Viernes' },
  { value: '6', label: 'Sábado' },
  { value: '7', label: 'Domingo' },
];
const kindName = (kind: string) =>
  kind === 'GARBAGE' ? 'Basura' : kind === 'CLEANING' ? 'Limpieza' : 'Otra tarea';
function PrepareCalendar() {
  const member = useMember(),
    cache = useQueryClient(),
    command = useCommand();
  const { setError } = command;
  useEffect(() => {
    let active = true;
    void call('refresh_calendar', { p_household: member.household_id })
      .then(() => {
        if (active)
          void cache.invalidateQueries({ queryKey: ['data', member.member_id, 'scheduled_tasks'] });
      })
      .catch(() => {
        if (active) setError('No se ha podido actualizar el calendario. Puedes reintentarlo.');
      });
    return () => {
      active = false;
    };
  }, [member.household_id, member.member_id, cache, setError]);
  return command.error ? (
    <Section>
      <ErrorText message={command.error} />
      <Button
        title="Actualizar calendario"
        secondary
        busy={command.busy}
        onPress={() =>
          command.run('calendar', () =>
            call('refresh_calendar', { p_household: member.household_id }),
          )
        }
      />
    </Section>
  ) : null;
}
function TaskCard({ task }: { task: Row<'scheduled_tasks'> }) {
  const member = useMember(),
    people = usePeople(),
    command = useCommand();
  return (
    <Card>
      <Heading>{task.title}</Heading>
      <Copy>
        {kindName(task.kind)} · {task.zone}
      </Copy>
      {!!task.description && <Copy>{task.description}</Copy>}
      <Copy>
        {people.name(task.assigned_to)} · {displayDay(task.due_date)}
        {task.due_time ? ` · ${task.due_time.slice(0, 5)}` : ''}
      </Copy>
      <Badge>
        {task.completed_at
          ? task.kind === 'GARBAGE'
            ? 'Basura retirada'
            : 'Completada'
          : task.due_date < dateOnly()
            ? 'Pendiente de otro día'
            : 'Pendiente'}
      </Badge>
      {task.completed_at ? (
        <Copy muted>Completada {displayInstant(task.completed_at)}</Copy>
      ) : (
        task.assigned_to === member.member_id && (
          <Button
            title="Marcar realizada"
            busy={command.busy}
            onPress={() =>
              command.run(task.id, () =>
                call('complete_task', { p_household: member.household_id, p_task: task.id }),
              )
            }
          />
        )
      )}
      <ErrorText message={command.error} />
    </Card>
  );
}
export function HouseScreen() {
  return (
    <Shell title="Casa" active="house">
      <PrepareCalendar />
      <Card onPress={() => go('calendar')}>
        <Heading>Calendario semanal</Heading>
        <Copy>Tareas y turnos de ducha</Copy>
      </Card>
      <Card onPress={() => go('tasks')}>
        <Heading>Tareas</Heading>
        <Copy>Pendientes y realizadas</Copy>
      </Card>
      <Card onPress={() => go('showers')}>
        <Heading>Duchas</Heading>
        <Copy>Horario habitual de cada residente</Copy>
      </Card>
      <Notice>
        Una tarea pendiente conserva su fecha. El siguiente turno sigue el calendario previsto.
      </Notice>
    </Shell>
  );
}
export function TasksScreen() {
  const [filter, setFilter] = useState('PENDING'),
    [person, setPerson] = useState('ALL'),
    [page, setPage] = useState(0);
  const people = usePeople();
  const query = useRows('scheduled_tasks', {
    filters: [
      ...(filter === 'PENDING'
        ? [{ column: 'completed_at', operator: 'is' as const, value: null }]
        : filter === 'DONE'
          ? [{ column: 'completed_at', operator: 'gt' as const, value: '1970-01-01T00:00:00Z' }]
          : []),
      ...(person === 'ALL' ? [] : [{ column: 'assigned_to', value: person }]),
    ],
    order: 'due_date',
    ascending: filter !== 'DONE',
    page,
  });
  return (
    <Shell title="Tareas" back refresh={query.refetch}>
      <PrepareCalendar />
      <Choices
        value={filter}
        options={[
          { value: 'PENDING', label: 'Pendientes' },
          { value: 'DONE', label: 'Realizadas' },
          { value: 'ALL', label: 'Todas' },
        ]}
        onChange={(v) => {
          setFilter(v);
          setPage(0);
        }}
      />
      <Choices
        label="Responsable"
        value={person}
        options={[
          { value: 'ALL', label: 'Ambos' },
          ...people.residents.map((p) => ({ value: p.id, label: p.display_name })),
        ]}
        onChange={(v) => {
          setPerson(v);
          setPage(0);
        }}
      />
      <QueryState query={query}>
        {!query.data?.rows.length && <Empty />}
        {query.data?.rows.map((t) => (
          <TaskCard key={t.id} task={t} />
        ))}
        <Pager page={page} count={query.data?.count ?? 0} onChange={setPage} />
      </QueryState>
    </Shell>
  );
}
export function ShowersScreen() {
  const people = usePeople(),
    member = useMember();
  const [page, setPage] = useState(0);
  const query = useRows('shower_slots', { order: 'weekday', ascending: true, page });
  return (
    <Shell title="Turnos de ducha" back refresh={query.refetch}>
      <QueryState query={query}>
        {!query.data?.rows.length && (
          <Empty text="El administrador todavía no ha configurado turnos." />
        )}
        {query.data?.rows.map((s) => (
          <Card key={s.id}>
            <Heading>{days.find((d) => Number(d.value) === s.weekday)?.label}</Heading>
            <Copy>
              {s.starts_at.slice(0, 5)}–{s.ends_at.slice(0, 5)} · {people.name(s.resident_id)}
            </Copy>
          </Card>
        ))}
        <Pager page={page} count={query.data?.count ?? 0} onChange={setPage} />
      </QueryState>
      {member.role === 'ADMIN' && (
        <Button title="Gestionar turnos" secondary onPress={() => go('shower-config')} />
      )}
    </Shell>
  );
}
export function CalendarScreen() {
  const today = dateOnly(),
    people = usePeople();
  const [start, setStart] = useState(shiftDay(today, 1 - weekday(today))),
    [page, setPage] = useState(0);
  const end = shiftDay(start, 7);
  const tasks = useRows('scheduled_tasks', {
    filters: [
      { column: 'due_date', operator: 'gte', value: start },
      { column: 'due_date', operator: 'lt', value: end },
    ],
    order: 'due_date',
    ascending: true,
    page,
  });
  const showers = useRows('shower_slots', { order: 'weekday', ascending: true, size: 200 });
  return (
    <Shell title="Calendario semanal" back>
      <PrepareCalendar />
      <LayoutRow>
        <Button
          title="Anterior"
          secondary
          onPress={() => {
            setStart(shiftDay(start, -7));
            setPage(0);
          }}
        />
        <Button
          title="Siguiente"
          secondary
          disabled={end > shiftDay(today, 14)}
          onPress={() => {
            setStart(end);
            setPage(0);
          }}
        />
      </LayoutRow>
      <Heading>
        {displayDay(start)} – {displayDay(shiftDay(end, -1))}
      </Heading>
      <QueryState query={tasks}>
        {Array.from({ length: 7 }, (_, i) => shiftDay(start, i)).map((day) => (
          <Section key={day}>
            <Heading>
              {days.find((d) => Number(d.value) === weekday(day))?.label} · {displayDay(day)}
            </Heading>
            {showers.data?.rows
              .filter((s) => s.weekday === weekday(day))
              .map((s) => (
                <Card key={s.id}>
                  <Copy>
                    Ducha · {s.starts_at.slice(0, 5)}–{s.ends_at.slice(0, 5)}
                  </Copy>
                  <Copy muted>{people.name(s.resident_id)}</Copy>
                </Card>
              ))}
            {tasks.data?.rows
              .filter((t) => t.due_date === day)
              .map((t) => (
                <TaskCard key={t.id} task={t} />
              ))}
          </Section>
        ))}
        <Pager page={page} count={tasks.data?.count ?? 0} onChange={setPage} />
      </QueryState>
      <QueryState query={showers}>
        <Copy muted>Los turnos de ducha muestran el horario habitual vigente.</Copy>
      </QueryState>
    </Shell>
  );
}
export function TaskConfigScreen() {
  const member = useMember(),
    people = usePeople(),
    command = useCommand();
  const [page, setPage] = useState(0);
  const query = useRows('task_templates', { page });
  return (
    <Shell title="Gestionar tareas" back>
      <Button title="Crear tarea periódica" onPress={() => go('task-new')} />
      <QueryState query={query}>
        {!query.data?.rows.length && <Empty />}
        {query.data?.rows.map((t) => (
          <Card key={t.id}>
            <Heading>{t.title}</Heading>
            <Copy>
              {kindName(t.kind)} · cada {t.interval_days} días
            </Copy>
            <Copy>
              {t.alternate ? 'Alternando residentes' : 'Responsable fijo'} · empieza{' '}
              {people.name(t.initial_resident_id)}
            </Copy>
            <Copy muted>
              Desde {displayDay(t.anchor_date)}
              {t.due_time ? ` · ${t.due_time.slice(0, 5)}` : ''}
            </Copy>
            <Badge>{t.enabled ? 'Activa' : 'Pausada'}</Badge>
            <Button
              title={t.enabled ? 'Pausar futuros turnos' : 'Reactivar'}
              secondary
              busy={command.busy}
              onPress={() =>
                command.run({ id: t.id, enabled: !t.enabled }, () =>
                  call('set_task_enabled', {
                    p_household: member.household_id,
                    p_template: t.id,
                    p_enabled: !t.enabled,
                  }),
                )
              }
            />
          </Card>
        ))}
        <Pager page={page} count={query.data?.count ?? 0} onChange={setPage} />
      </QueryState>
      <Notice>Los turnos ya creados se conservan al pausar una tarea.</Notice>
      <ErrorText message={command.error} />
    </Shell>
  );
}
export function TaskFormScreen() {
  const member = useMember(),
    people = usePeople(),
    command = useCommand();
  const [title, setTitle] = useState(''),
    [description, setDescription] = useState(''),
    [zone, setZone] = useState(''),
    [kind, setKind] = useState('CLEANING'),
    [resident, setResident] = useState(member.member_id),
    [anchor, setAnchor] = useState(dateOnly()),
    [interval, setInterval] = useState('7'),
    [time, setTime] = useState('20:00'),
    [hasTime, setHasTime] = useState(false),
    [alternate, setAlternate] = useState(true);
  const save = async () => {
    const result = await command.run(
      { title, description, zone, kind, resident, anchor, interval, time, hasTime, alternate },
      async (key) => {
        if (!/^\d+$/.test(interval) || Number(interval) < 1 || Number(interval) > 366)
          throw new AppError('La periodicidad debe ser de 1 a 366 días.');
        const id = await call('create_task_template', {
          p_household: member.household_id,
          p_title: required(title, 'Título', 120),
          p_description: description.trim(),
          p_zone: required(zone, 'Zona', 120),
          p_kind: kind,
          p_resident: resident,
          p_anchor: anchor,
          p_interval_days: Number(interval),
          p_due_time: hasTime ? time : null,
          p_alternate: alternate,
          p_request_id: key,
        });
        await call('refresh_calendar', { p_household: member.household_id });
        return id;
      },
    );
    if (result) go('task-config', {}, true);
  };
  return (
    <Shell title="Nueva tarea periódica" back>
      <Field label="Título" value={title} onChangeText={setTitle} maxLength={120} />
      <Choices
        label="Tipo"
        value={kind}
        options={[
          { value: 'CLEANING', label: 'Limpieza' },
          { value: 'GARBAGE', label: 'Basura' },
          { value: 'OTHER', label: 'Otra' },
        ]}
        onChange={setKind}
      />
      <Field label="Zona" value={zone} onChangeText={setZone} maxLength={120} />
      <Field
        label="Descripción (opcional)"
        value={description}
        onChangeText={setDescription}
        multiline
        maxLength={3000}
      />
      <Choices
        label="Primer responsable"
        value={resident}
        options={people.residents.map((p) => ({ value: p.id, label: p.display_name }))}
        onChange={setResident}
      />
      <Check label="Alternar entre los dos residentes" value={alternate} onChange={setAlternate} />
      <DateField label="Primer día" value={anchor} mode="date" onChange={setAnchor} />
      <Field
        label="Repetir cada cuántos días"
        value={interval}
        onChangeText={setInterval}
        keyboardType="number-pad"
        maxLength={3}
      />
      <Check label="Fijar una hora" value={hasTime} onChange={setHasTime} />
      {hasTime && <DateField label="Hora prevista" value={time} mode="time" onChange={setTime} />}
      <ErrorText message={command.error} />
      <Button title="Crear tarea" busy={command.busy} onPress={save} />
    </Shell>
  );
}
export function ShowerConfigScreen() {
  const member = useMember(),
    people = usePeople(),
    command = useCommand();
  const [selected, setSelected] = useState<Row<'shower_slots'> | null>(null),
    [page, setPage] = useState(0);
  const query = useRows('shower_slots', { order: 'weekday', ascending: true, page });
  return (
    <Shell title="Gestionar duchas" back>
      <Button title="Crear turno" onPress={() => go('shower-edit')} />
      {selected && (
        <Notice>
          Intercambiar el turno de {people.name(selected.resident_id)}. Selecciona un turno del otro
          residente.
        </Notice>
      )}
      <QueryState query={query}>
        {query.data?.rows.map((s) => (
          <Card key={s.id}>
            <Heading>{days.find((d) => Number(d.value) === s.weekday)?.label}</Heading>
            <Copy>
              {s.starts_at.slice(0, 5)}–{s.ends_at.slice(0, 5)} · {people.name(s.resident_id)}
            </Copy>
            <Button
              title="Editar turno"
              secondary
              onPress={() => go('shower-edit', { id: s.id })}
            />
            <Button
              title={selected ? 'Intercambiar con este' : 'Elegir para intercambio'}
              secondary
              disabled={command.busy || selected?.resident_id === s.resident_id}
              onPress={async () => {
                if (!selected) {
                  setSelected(s);
                  return;
                }
                const result = await command.run({ first: selected.id, second: s.id }, async () => {
                  await call('swap_shower_slots', {
                    p_household: member.household_id,
                    p_first: selected.id,
                    p_second: s.id,
                    p_first_revision: selected.revision,
                    p_second_revision: s.revision,
                  });
                  return true;
                });
                if (result) setSelected(null);
              }}
            />
          </Card>
        ))}
        <Pager page={page} count={query.data?.count ?? 0} onChange={setPage} />
      </QueryState>
      {selected && (
        <Button title="Cancelar intercambio" secondary onPress={() => setSelected(null)} />
      )}
      <ErrorText message={command.error} />
    </Shell>
  );
}
export function ShowerFormScreen() {
  const rawId = useParam('id'),
    id = useId(),
    member = useMember(),
    people = usePeople(),
    command = useCommand();
  const query = useDetail('shower_slots', id),
    initialized = useRef(false);
  const [resident, setResident] = useState(member.member_id),
    [day, setDay] = useState('1'),
    [start, setStart] = useState('07:00'),
    [end, setEnd] = useState('07:30'),
    [revision, setRevision] = useState<number | null>(null);
  useEffect(() => {
    const s = query.data?.rows[0];
    if (rawId && s && !initialized.current) {
      initialized.current = true;
      setResident(s.resident_id);
      setDay(String(s.weekday));
      setStart(s.starts_at.slice(0, 5));
      setEnd(s.ends_at.slice(0, 5));
      setRevision(s.revision);
    }
  }, [rawId, query.data]);
  const save = async () => {
    const result = await command.run(
      { rawId, resident, day, start, end, revision },
      async (key) => {
        if (start >= end) throw new AppError('La hora de fin debe ser posterior al inicio.');
        if (rawId)
          await call('edit_shower_slot', {
            p_household: member.household_id,
            p_slot: id,
            p_resident: resident,
            p_weekday: Number(day),
            p_start: start,
            p_end: end,
            p_expected_revision: revision,
          });
        else
          await call('create_shower_slot', {
            p_household: member.household_id,
            p_resident: resident,
            p_weekday: Number(day),
            p_start: start,
            p_end: end,
            p_request_id: key,
          });
        return true;
      },
    );
    if (result) go('shower-config', {}, true);
  };
  return (
    <Shell title={rawId ? 'Editar turno' : 'Crear turno de ducha'} back>
      {rawId && (
        <QueryState query={query}>
          {!query.data?.rows.length && <Empty text="Este turno no está disponible." />}
        </QueryState>
      )}
      <Choices
        label="Residente"
        value={resident}
        options={people.residents.map((p) => ({ value: p.id, label: p.display_name }))}
        onChange={setResident}
      />
      <Choices label="Día de la semana" value={day} options={days} onChange={setDay} />
      <DateField label="Desde" mode="time" value={start} onChange={setStart} />
      <DateField label="Hasta" mode="time" value={end} onChange={setEnd} />
      <ErrorText message={command.error} />
      <Button
        title="Guardar turno"
        busy={command.busy}
        disabled={!!rawId && revision === null}
        onPress={save}
      />
    </Shell>
  );
}
