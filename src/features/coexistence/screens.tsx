import { useState } from 'react';
import { Alert } from 'react-native';
import {
  Shell,
  Section,
  Card,
  Copy,
  Heading,
  Button,
  Choices,
  Field,
  DateField,
  Badge,
  Empty,
  ErrorText,
  QueryState,
  Pager,
  Row,
  Notice,
  go,
} from '../../components/ui';
import { useMember } from '../auth/provider';
import { useClock, useCommand, usePageQuery, useRows } from '../../services/hooks';
import { AppError, call } from '../../services/api';
import { dateOnly, displayInstant, localDateTime, shiftDay, weekday } from '../../domain/dates';
import {
  categories,
  decisionName,
  optionalPhoto,
  required,
  useDetail,
  useId,
  useParam,
  usePeople,
  visitKinds,
} from '../shared';
import type { Row as DbRow } from '../../services/database.types';
import { Attachments, PhotoPicker, usePhoto } from '../photos/components';

export function CoexistenceScreen() {
  return (
    <Shell title="Convivencia" active="coexistence">
      {(
        [
          ['rules', 'Normas', 'Consulta las normas vigentes'],
          ['faults', 'Faltas', 'Histórico y estadísticas'],
          ['complaints', 'Quejas', 'Problemas de convivencia'],
          ['visits', 'Excepciones de visitas', 'Solicitudes y autorizaciones'],
          ['reports', 'Resumen semanal', 'Informes anteriores'],
        ] as const
      ).map(([screen, title, description]) => (
        <Card key={screen} onPress={() => go(screen)}>
          <Heading>{title}</Heading>
          <Copy muted>{description}</Copy>
        </Card>
      ))}
    </Shell>
  );
}

export function RulesScreen() {
  const member = useMember(),
    now = useClock();
  const [proposalPage, setProposalPage] = useState(0);
  const [category, setCategory] = useState('ALL');
  const [page, setPage] = useState(0);
  const query = useRows('latest_rules', {
    filters: category === 'ALL' ? [] : [{ column: 'category', value: category }],
    order: 'title',
    ascending: true,
    page,
  });
  const proposals = useRows('rule_proposals', {
    filters: [{ column: 'result', operator: 'is', value: null }],
    page: proposalPage,
  });
  return (
    <Shell
      title={member.role === 'CONTROLLER' ? 'Normas y cambios' : 'Normas'}
      back
      refresh={query.refetch}
    >
      <Choices
        value={category}
        options={[{ value: 'ALL', label: 'Todas' }, ...categories]}
        onChange={(value) => {
          setCategory(value);
          setPage(0);
        }}
      />
      {member.role === 'ADMIN' && <Button title="Nueva norma" onPress={() => go('rule-form')} />}
      <QueryState query={proposals}>
        {!!proposals.data?.rows.length && (
          <Section>
            <Heading>Propuestas pendientes</Heading>
            {proposals.data.rows.map((p) => (
              <Card key={p.id} onPress={() => go('rule', { id: p.rule_id })}>
                <Heading>{p.title}</Heading>
                <Badge>Pendiente de aprobación</Badge>
              </Card>
            ))}
          </Section>
        )}
        <Pager page={proposalPage} count={proposals.data?.count ?? 0} onChange={setProposalPage} />
      </QueryState>
      <QueryState query={query}>
        {!query.data?.rows.length && <Empty text="No hay normas en esta categoría." />}
        {query.data?.rows.map((rule) => (
          <Card key={rule.id} onPress={() => go('rule', { id: rule.rule_id })}>
            <Heading>{rule.title}</Heading>
            <Copy>{rule.description}</Copy>
            <Copy muted>
              {new Date(rule.effective_at).getTime() > now ? 'Entra en vigor' : 'Vigente desde'}{' '}
              {displayInstant(rule.effective_at)}
            </Copy>
          </Card>
        ))}
        <Pager page={page} count={query.data?.count ?? 0} onChange={setPage} />
      </QueryState>
    </Shell>
  );
}
export function RuleScreen() {
  const id = useId(),
    member = useMember(),
    command = useCommand(),
    people = usePeople();
  const [versionPage, setVersionPage] = useState(0);
  const now = useClock();
  const versions = useRows('rule_versions', {
    filters: [{ column: 'rule_id', value: id }],
    order: 'version',
    page: versionPage,
  });
  const proposals = useRows('rule_proposals', {
    filters: [
      { column: 'rule_id', value: id },
      { column: 'result', operator: 'is', value: null },
    ],
  });
  const current = useRows('latest_rules', {
    filters: [{ column: 'rule_id', value: id }],
    order: 'id',
    size: 1,
  });
  const rule = current.data?.rows[0] ?? versions.data?.rows[0];
  const proposal = proposals.data?.rows.find((p) => p.result === null);
  const decide = async (decision: 'APPROVED' | 'REJECTED') => {
    if (!proposal) return;
    await command.run({ proposal: proposal.id, decision }, async () => {
      await call('decide_rule_change', {
        p_household: member.household_id,
        p_proposal: proposal.id,
        p_decision: decision,
      });
      return true;
    });
  };
  return (
    <Shell title={rule?.title ?? 'Norma'} back refresh={versions.refetch}>
      <QueryState query={versions}>
        {!rule ? (
          <Empty text="Esta norma no está disponible." />
        ) : (
          <>
            <Card>
              <Copy muted>{categories.find((c) => c.value === rule.category)?.label}</Copy>
              <Heading>
                {new Date(rule.effective_at).getTime() > now
                  ? 'Versión programada'
                  : 'Versión vigente'}{' '}
                · {rule.version}
              </Heading>
              <Copy>{rule.description}</Copy>
              <Copy muted>Desde {displayInstant(rule.effective_at)}</Copy>
            </Card>
            <QueryState query={proposals}>
              {proposal && (
                <Card>
                  <Badge>Propuesta pendiente</Badge>
                  <Heading>{proposal.title}</Heading>
                  <Copy>{proposal.description}</Copy>
                  <Copy muted>Motivo: {proposal.reason || 'Sin motivo adicional'}</Copy>
                  <Copy muted>Propuesta por {people.name(proposal.proposed_by)}</Copy>
                  {member.role === 'CONTROLLER' && (
                    <>
                      <Button
                        title="Aprobar cambio"
                        busy={command.busy}
                        onPress={() => decide('APPROVED')}
                      />
                      <Button
                        title="Rechazar"
                        secondary
                        disabled={command.busy}
                        onPress={() => decide('REJECTED')}
                      />
                    </>
                  )}
                </Card>
              )}
            </QueryState>
            {member.role === 'ADMIN' && !proposal && (
              <Button title="Proponer modificación" onPress={() => go('rule-form', { id })} />
            )}
            <Heading>Historial de versiones</Heading>
            {versions.data?.rows.map((v) => (
              <Card key={v.id}>
                <Heading>
                  Versión {v.version} · {v.title}
                </Heading>
                <Copy>{v.description}</Copy>
                <Copy muted>
                  {displayInstant(v.effective_at)} · {people.name(v.created_by)}
                </Copy>
                {v.approved_by && <Copy muted>Aprobada por {people.name(v.approved_by)}</Copy>}
              </Card>
            ))}
            <Pager page={versionPage} count={versions.data?.count ?? 0} onChange={setVersionPage} />
          </>
        )}
      </QueryState>
      <ErrorText message={command.error} />
    </Shell>
  );
}
export function RuleFormScreen() {
  const rawId = useParam('id'),
    id = useId(),
    source = useParam('complaint');
  const complaint = useDetail('complaints', source || '00000000-0000-4000-8000-000000000000');
  const query = useRows('latest_rules', {
    filters: [{ column: 'rule_id', value: id }],
    order: 'id',
    size: 1,
  });
  if (rawId && (query.isPending || query.isError || !query.data?.rows[0]))
    return (
      <Shell title="Modificar norma" back>
        <QueryState query={query}>
          <Empty text="Esta norma no está disponible." />
        </QueryState>
      </Shell>
    );
  if (source && (complaint.isPending || complaint.isError))
    return (
      <Shell title="Crear norma" back>
        <QueryState query={complaint}>{null}</QueryState>
      </Shell>
    );
  return (
    <RuleEditor
      original={rawId ? (query.data?.rows[0] ?? null) : null}
      sourceComplaint={complaint.data?.rows[0]}
    />
  );
}
function RuleEditor({
  original,
  sourceComplaint,
}: {
  original: DbRow<'latest_rules'> | null;
  sourceComplaint?: DbRow<'complaints'>;
}) {
  const rawId = useParam('id'),
    id = useId(),
    source = useParam('complaint'),
    member = useMember(),
    command = useCommand();
  const [title, setTitle] = useState(original?.title ?? sourceComplaint?.title ?? ''),
    [category, setCategory] = useState(original?.category ?? 'HOURS'),
    [description, setDescription] = useState(
      original?.description ?? sourceComplaint?.description ?? '',
    ),
    [reason, setReason] = useState('');
  const [version] = useState(original?.version ?? null);
  const [effectiveAt, setEffectiveAt] = useState(() => new Date().toISOString());
  const save = async () => {
    const result = await command.run(
      { rawId, title, category, description, reason, source, effectiveAt, version },
      async (key) => {
        const t = required(title, 'Título', 120),
          body = required(description, 'Descripción', 10000);
        return rawId
          ? call('propose_rule_change', {
              p_household: member.household_id,
              p_rule: id,
              p_title: t,
              p_category: category,
              p_description: body,
              p_reason: reason.trim(),
              p_request_id: key,
              p_expected_version: version,
            })
          : call('create_rule', {
              p_household: member.household_id,
              p_title: t,
              p_category: category,
              p_description: body,
              p_effective_at: effectiveAt,
              p_request_id: key,
              p_complaint_id: source || null,
            });
      },
    );
    if (result) go(rawId ? 'rule' : 'rules', rawId ? { id } : {}, true);
  };
  return (
    <Shell title={rawId ? 'Proponer modificación' : 'Nueva norma'} back>
      <Field label="Título" value={title} onChangeText={setTitle} maxLength={120} />
      <Choices label="Categoría" value={category} options={categories} onChange={setCategory} />
      <Field
        label="Descripción"
        value={description}
        onChangeText={setDescription}
        multiline
        maxLength={10000}
      />
      {rawId && (
        <>
          <Field
            label="Motivo del cambio (opcional)"
            value={reason}
            onChangeText={setReason}
            multiline
            maxLength={2000}
          />
          <Notice>
            La versión vigente se mantiene hasta que el controlador apruebe el cambio.
          </Notice>
        </>
      )}
      {!rawId && (
        <DateField label="Entrada en vigor" value={effectiveAt} onChange={setEffectiveAt} />
      )}
      <ErrorText message={command.error} />
      <Button
        title={rawId ? 'Enviar propuesta al controlador' : 'Crear norma'}
        busy={command.busy}
        onPress={save}
      />
    </Shell>
  );
}

export function FaultsScreen() {
  const member = useMember(),
    people = usePeople(),
    now = useClock();
  const [person, setPerson] = useState('ALL'),
    [page, setPage] = useState(0),
    [period, setPeriod] = useState('ALL'),
    [category, setCategory] = useState('ALL'),
    [rule, setRule] = useState('ALL'),
    [rulePage, setRulePage] = useState(0),
    [monthly, setMonthly] = useState(false),
    [before, setBefore] = useState(dateOnly());
  const statistics = usePageQuery(['fault-statistics', period], () =>
    call('fault_statistics', { p_household: member.household_id, p_period: period }),
  );
  const evolution = usePageQuery(['fault-monthly', before], () =>
    call('fault_monthly', { p_household: member.household_id, p_before: before }),
  );
  const rules = useRows('current_rules', {
    order: 'title',
    ascending: true,
    page: rulePage,
    size: 10,
  });
  const today = dateOnly(new Date(now)),
    start = period === 'WEEK' ? shiftDay(today, 1 - weekday(today)) : today.slice(0, 7) + '-01';
  const query = useRows('fault_history', {
    filters: [
      ...(person === 'ALL' ? [] : [{ column: 'responsible_id', value: person }]),
      ...(category === 'ALL' ? [] : [{ column: 'category', value: category }]),
      ...(rule === 'ALL' ? [] : [{ column: 'rule_id', value: rule }]),
      ...(period === 'ALL'
        ? []
        : [
            {
              column: 'occurred_at',
              operator: 'gte' as const,
              value: localDateTime(start, '00:00').toISOString(),
            },
          ]),
    ],
    order: 'occurred_at',
    page,
  });
  return (
    <Shell
      title="Faltas"
      active={member.role === 'CONTROLLER' ? 'faults' : 'coexistence'}
      refresh={query.refetch}
    >
      <Choices
        label="Periodo por fecha del hecho"
        value={period}
        options={[
          { value: 'WEEK', label: 'Esta semana' },
          { value: 'MONTH', label: 'Este mes' },
          { value: 'ALL', label: 'Total' },
        ]}
        onChange={(v) => {
          setPeriod(v);
          setPage(0);
        }}
      />
      <QueryState query={statistics}>
        {people.residents.map((p) => (
          <Card key={p.id}>
            <Heading>{p.display_name}</Heading>
            {categories.map((c) => (
              <Copy key={c.value}>
                {c.label}:{' '}
                {statistics.data?.find((s) => s.responsible_id === p.id && s.category === c.value)
                  ?.total ?? 0}
              </Copy>
            ))}
          </Card>
        ))}
      </QueryState>
      <Button
        title={monthly ? 'Ocultar evolución mensual' : 'Ver evolución mensual'}
        secondary
        onPress={() => setMonthly(!monthly)}
      />
      {monthly && (
        <QueryState query={evolution}>
          {[...new Set(evolution.data?.map((r) => r.month))].map((month) => (
            <Card key={month}>
              <Heading>{month}</Heading>
              {evolution.data
                ?.filter((r) => r.month === month)
                .map((r) => (
                  <Copy key={r.responsible_id}>
                    {people.name(r.responsible_id)}: {r.total}
                  </Copy>
                ))}
            </Card>
          ))}
          <Row>
            <Button
              title="12 meses anteriores"
              secondary
              onPress={() => setBefore(Number(before.slice(0, 4)) - 1 + before.slice(4))}
            />
            <Button title="Volver al año actual" secondary onPress={() => setBefore(today)} />
          </Row>
        </QueryState>
      )}
      <Choices
        label="Historial por responsable"
        value={person}
        options={[
          { value: 'ALL', label: 'Todas' },
          ...people.residents.map((p) => ({ value: p.id, label: p.display_name })),
        ]}
        onChange={(value) => {
          setPerson(value);
          setPage(0);
        }}
      />
      <Choices
        label="Categoría"
        value={category}
        options={[{ value: 'ALL', label: 'Todas' }, ...categories]}
        onChange={(v) => {
          setCategory(v);
          setPage(0);
        }}
      />
      <QueryState query={rules}>
        <Choices
          label="Norma"
          value={rule}
          options={[
            { value: 'ALL', label: 'Todas' },
            ...(rules.data?.rows ?? []).map((r) => ({ value: r.rule_id, label: r.title })),
          ]}
          onChange={(v) => {
            setRule(v);
            setPage(0);
          }}
        />
        <Pager page={rulePage} count={rules.data?.count ?? 0} onChange={setRulePage} size={10} />
      </QueryState>
      {member.role !== 'CONTROLLER' && (
        <Button title="Añadir falta" onPress={() => go('fault-new')} />
      )}
      <QueryState query={query}>
        <Copy muted>{query.data?.count ?? 0} faltas en esta vista</Copy>
        {!query.data?.rows.length && <Empty />}
        {query.data?.rows.map((f) => (
          <Card key={f.id} onPress={() => go('fault', { id: f.id })}>
            <Heading>
              {people.name(f.responsible_id)} · {f.rule_title}
            </Heading>
            <Copy>{f.description}</Copy>
            <Copy muted>Ocurrió: {displayInstant(f.occurred_at)}</Copy>
            {f.photo_count > 0 && <Copy muted>Fotografía disponible</Copy>}
            <Badge>{f.maintained_at ? 'Mantenida' : 'Pendiente de revisión'}</Badge>
          </Card>
        ))}
        <Pager page={page} count={query.data?.count ?? 0} onChange={setPage} />
      </QueryState>
    </Shell>
  );
}
export function FaultFormScreen() {
  const member = useMember(),
    people = usePeople(),
    command = useCommand(),
    photo = usePhoto();
  const [rulePage, setRulePage] = useState(0);
  const rules = useRows('current_rules', {
    order: 'title',
    ascending: true,
    size: 20,
    page: rulePage,
  });
  const [responsible, setResponsible] = useState(member.member_id),
    [rule, setRule] = useState(''),
    [occurred, setOccurred] = useState(() => new Date().toISOString()),
    [description, setDescription] = useState('');
  const save = async () => {
    const result = await command.run({ responsible, rule, occurred, description }, async (key) => {
      if (!rule) throw new AppError('Selecciona la norma incumplida.');
      const id = await call('register_fault', {
        p_household: member.household_id,
        p_responsible: responsible,
        p_rule: rule,
        p_occurred_at: occurred,
        p_description: required(description, 'Descripción'),
        p_request_id: key,
      });
      await optionalPhoto(member.household_id, 'FAULT', id, photo.photo);
      return id;
    });
    if (result) go('fault', { id: result }, true);
  };
  return (
    <Shell title="Registrar falta" back>
      <Choices
        label="¿Quién ha incumplido?"
        value={responsible}
        options={people.residents.map((p) => ({ value: p.id, label: p.display_name }))}
        onChange={setResponsible}
      />
      <QueryState query={rules}>
        <Choices
          label="Norma incumplida"
          value={rule}
          options={(rules.data?.rows ?? []).map((r) => ({ value: r.rule_id, label: r.title }))}
          onChange={setRule}
        />
        {!rules.data?.rows.length && (
          <Empty text="No hay normas vigentes. El administrador debe añadirlas primero." />
        )}
        <Pager page={rulePage} count={rules.data?.count ?? 0} size={20} onChange={setRulePage} />
      </QueryState>
      <DateField label="Cuándo ocurrió" value={occurred} onChange={setOccurred} />
      <Field
        label="Descripción"
        value={description}
        onChangeText={setDescription}
        multiline
        maxLength={5000}
      />
      <PhotoPicker photo={photo.photo} onChange={photo.setPhoto} />
      <Copy muted>
        Se incluirá en el próximo resumen semanal. No se enviará un aviso inmediato.
      </Copy>
      <ErrorText message={command.error} />
      <Button title="Registrar falta" busy={command.busy} onPress={save} />
    </Shell>
  );
}
export function FaultScreen() {
  const id = useId(),
    member = useMember(),
    people = usePeople(),
    command = useCommand();
  const query = useDetail('faults', id),
    fault = query.data?.rows[0];
  const version = useDetail(
    'rule_versions',
    fault?.rule_version_id ?? '00000000-0000-4000-8000-000000000000',
  );
  const [page, setPage] = useState(0),
    [body, setBody] = useState('');
  const comments = useRows('fault_comments', {
    filters: [{ column: 'fault_id', value: id }],
    ascending: true,
    page,
  });
  const erase = () =>
    Alert.alert(
      'Eliminar falta definitivamente',
      'Se borrarán la descripción, las fotografías y los comentarios, también de los informes. Solo quedará una anotación de eliminación.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar falta',
          style: 'destructive',
          onPress: () => {
            void command
              .run({ delete: id }, (key) =>
                call('delete_fault', {
                  p_household: member.household_id,
                  p_fault: id,
                  p_request_id: key,
                }),
              )
              .then((result) => {
                if (result) go('faults', {}, true);
              });
          },
        },
      ],
    );
  return (
    <Shell title="Falta" back refresh={query.refetch}>
      <QueryState query={query}>
        {!fault ? (
          <Empty text="Esta falta ya no está disponible." />
        ) : (
          <>
            <Card>
              <Heading>{people.name(fault.responsible_id)}</Heading>
              <Copy strong>{version.data?.rows[0]?.title ?? 'Norma aplicable'}</Copy>
              <Copy>{fault.description}</Copy>
              <Copy muted>Ocurrió: {displayInstant(fault.occurred_at)}</Copy>
              <Copy muted>Se registró: {displayInstant(fault.registered_at)}</Copy>
              <Copy muted>Registrada por {people.name(fault.reported_by)}</Copy>
              <Badge>{fault.maintained_at ? 'Mantenida' : 'Pendiente de revisión'}</Badge>
            </Card>
            <Attachments kind="FAULT" id={id} canAdd={fault.reported_by === member.member_id} />
            {member.role === 'CONTROLLER' && (
              <>
                <Button
                  title="Mantener falta"
                  secondary
                  busy={command.busy}
                  disabled={!!fault.maintained_at}
                  onPress={() =>
                    command.run({ maintain: id }, () =>
                      call('maintain_fault', { p_household: member.household_id, p_fault: id }),
                    )
                  }
                />
                <Button title="Eliminar falta" danger disabled={command.busy} onPress={erase} />
              </>
            )}
            <Heading>Comentarios</Heading>
            <QueryState query={comments}>
              {comments.data?.rows.map((c) => (
                <Card key={c.id}>
                  <Copy strong>{people.name(c.author_id)}</Copy>
                  <Copy>{c.body}</Copy>
                  <Copy muted>{displayInstant(c.created_at)}</Copy>
                </Card>
              ))}
              <Pager page={page} count={comments.data?.count ?? 0} onChange={setPage} />
            </QueryState>
            {member.role !== 'CONTROLLER' && (
              <>
                <Field
                  label="Añadir comentario"
                  value={body}
                  onChangeText={setBody}
                  multiline
                  maxLength={3000}
                />
                <Button
                  title="Publicar comentario"
                  busy={command.busy}
                  onPress={async () => {
                    const result = await command.run({ id, body }, (key) =>
                      call('comment_fault', {
                        p_household: member.household_id,
                        p_fault: id,
                        p_body: required(body, 'Comentario', 3000),
                        p_request_id: key,
                      }),
                    );
                    if (result) setBody('');
                  }}
                />
              </>
            )}
          </>
        )}
      </QueryState>
      <ErrorText message={command.error} />
    </Shell>
  );
}

export function ComplaintsScreen() {
  const member = useMember(),
    people = usePeople(),
    [page, setPage] = useState(0);
  const query = useRows('complaints', { page });
  return (
    <Shell
      title="Quejas"
      active={member.role === 'CONTROLLER' ? 'complaints' : 'coexistence'}
      refresh={query.refetch}
    >
      {member.role !== 'CONTROLLER' && (
        <Button title="Añadir queja" onPress={() => go('complaint-new')} />
      )}
      <QueryState query={query}>
        {!query.data?.rows.length && <Empty />}
        {query.data?.rows.map((c) => (
          <Card key={c.id} onPress={() => go('complaint', { id: c.id })}>
            <Heading>{c.title}</Heading>
            <Copy muted>
              {people.name(c.author_id)} → {c.target_id ? people.name(c.target_id) : 'General'}
            </Copy>
            <Copy>{c.description}</Copy>
            <Copy muted>{displayInstant(c.created_at)}</Copy>
          </Card>
        ))}
        <Pager page={page} count={query.data?.count ?? 0} onChange={setPage} />
      </QueryState>
    </Shell>
  );
}
export function ComplaintFormScreen() {
  const member = useMember(),
    people = usePeople(),
    command = useCommand(),
    photo = usePhoto();
  const [target, setTarget] = useState('GENERAL'),
    [title, setTitle] = useState(''),
    [body, setBody] = useState('');
  return (
    <Shell title="Nueva queja" back>
      <Choices
        label="Dirigida a"
        value={target}
        options={[
          { value: 'GENERAL', label: 'General' },
          ...people.residents.map((p) => ({ value: p.id, label: p.display_name })),
        ]}
        onChange={setTarget}
      />
      <Field label="Título" value={title} onChangeText={setTitle} maxLength={120} />
      <Field label="Descripción" value={body} onChangeText={setBody} multiline maxLength={5000} />
      <PhotoPicker photo={photo.photo} onChange={photo.setPhoto} />
      <Copy muted>La queja aparecerá en el resumen semanal, sin aviso inmediato.</Copy>
      <ErrorText message={command.error} />
      <Button
        title="Registrar queja"
        busy={command.busy}
        onPress={async () => {
          const result = await command.run({ target, title, body }, async (key) => {
            const id = await call('register_complaint', {
              p_household: member.household_id,
              p_target: target === 'GENERAL' ? null : target,
              p_title: required(title, 'Título', 120),
              p_description: required(body, 'Descripción'),
              p_request_id: key,
            });
            await optionalPhoto(member.household_id, 'COMPLAINT', id, photo.photo);
            return id;
          });
          if (result) go('complaint', { id: result }, true);
        }}
      />
    </Shell>
  );
}
export function ComplaintScreen() {
  const id = useId(),
    member = useMember(),
    people = usePeople(),
    query = useDetail('complaints', id),
    item = query.data?.rows[0];
  return (
    <Shell title="Queja" back refresh={query.refetch}>
      <QueryState query={query}>
        {!item ? (
          <Empty text="Esta queja ya no está disponible." />
        ) : (
          <>
            <Card>
              <Heading>{item.title}</Heading>
              <Copy>{item.description}</Copy>
              <Copy muted>
                {people.name(item.author_id)} →{' '}
                {item.target_id ? people.name(item.target_id) : 'General'}
              </Copy>
              <Copy muted>{displayInstant(item.created_at)}</Copy>
            </Card>
            <Attachments kind="COMPLAINT" id={id} canAdd={item.author_id === member.member_id} />
            {member.role === 'ADMIN' && (
              <Button
                title="Crear una norma a partir de esta queja"
                onPress={() => go('rule-form', { complaint: id })}
              />
            )}
          </>
        )}
      </QueryState>
    </Shell>
  );
}

export function VisitsScreen() {
  const member = useMember(),
    people = usePeople(),
    [page, setPage] = useState(0);
  const query = useRows('visit_exceptions', { page });
  return (
    <Shell
      title="Excepciones de visitas"
      active={member.role === 'CONTROLLER' ? 'visits' : 'coexistence'}
      refresh={query.refetch}
    >
      {member.role !== 'CONTROLLER' && (
        <Button title="Solicitar excepción" onPress={() => go('visit-new')} />
      )}
      <QueryState query={query}>
        {!query.data?.rows.length && <Empty />}
        {query.data?.rows.map((v) => (
          <Card key={v.id} onPress={() => go('visit', { id: v.id })}>
            <Heading>{v.visitor}</Heading>
            <Copy>
              {displayInstant(v.starts_at)} → {displayInstant(v.ends_at)}
            </Copy>
            <Copy muted>Solicitada por {people.name(v.requested_by)}</Copy>
            <Badge>{decisionName(v.status)}</Badge>
            <Copy>Otro residente: {decisionName(v.resident_decision)}</Copy>
            <Copy>Controlador: {decisionName(v.controller_decision)}</Copy>
          </Card>
        ))}
        <Pager page={page} count={query.data?.count ?? 0} onChange={setPage} />
      </QueryState>
    </Shell>
  );
}
export function VisitFormScreen() {
  const member = useMember(),
    people = usePeople(),
    command = useCommand();
  const [visitor, setVisitor] = useState(''),
    [kind, setKind] = useState('BOTH'),
    [reason, setReason] = useState(''),
    [start, setStart] = useState(() => new Date().toISOString()),
    [end, setEnd] = useState(() => new Date(Date.now() + 12 * 3600_000).toISOString());
  const other = people.residents.find((p) => p.id !== member.member_id);
  return (
    <Shell title="Excepción de visita" subtitle="Indica qué necesitas y hasta cuándo." back>
      <Field label="Visitante" value={visitor} onChangeText={setVisitor} maxLength={120} />
      <Choices label="¿Qué solicitas?" value={kind} options={visitKinds} onChange={setKind} />
      <DateField label="Desde" value={start} onChange={setStart} />
      <DateField label="Hasta" value={end} onChange={setEnd} />
      <Field label="Motivo" value={reason} onChangeText={setReason} multiline maxLength={3000} />
      <Card>
        <Heading>Dos aprobaciones necesarias</Heading>
        <Row>
          <Copy>{other?.display_name ?? 'Otro residente'}</Copy>
          <Badge>Pendiente</Badge>
        </Row>
        <Row>
          <Copy>Controlador</Copy>
          <Badge>Pendiente</Badge>
        </Row>
      </Card>
      <ErrorText message={command.error} />
      <Button
        title="Enviar solicitud"
        busy={command.busy}
        onPress={async () => {
          const result = await command.run({ visitor, kind, reason, start, end }, (key) => {
            if (new Date(end) <= new Date(start))
              throw new AppError('La hora de fin debe ser posterior al inicio.');
            return call('request_visit_exception', {
              p_household: member.household_id,
              p_visitor: required(visitor, 'Visitante', 120),
              p_reason: required(reason, 'Motivo', 3000),
              p_kind: kind,
              p_starts_at: start,
              p_ends_at: end,
              p_request_id: key,
            });
          });
          if (result) go('visit', { id: result }, true);
        }}
      />
    </Shell>
  );
}
export function VisitScreen() {
  const id = useId(),
    member = useMember(),
    people = usePeople(),
    command = useCommand(),
    query = useDetail('visit_exceptions', id),
    v = query.data?.rows[0];
  const now = useClock();
  const canDecide =
    v &&
    v.status === 'PENDING' &&
    new Date(v.ends_at).getTime() > now &&
    ((v.other_resident_id === member.member_id && !v.resident_decision) ||
      (v.controller_id === member.member_id && !v.controller_decision));
  return (
    <Shell title="Excepción de visita" back refresh={query.refetch}>
      <QueryState query={query}>
        {!v ? (
          <Empty text="Esta solicitud ya no está disponible." />
        ) : (
          <>
            <Card>
              <Heading>{v.visitor}</Heading>
              <Copy>{visitKinds.find((k) => k.value === v.kind)?.label}</Copy>
              <Copy>Desde {displayInstant(v.starts_at)}</Copy>
              <Copy>Hasta {displayInstant(v.ends_at)}</Copy>
              <Copy>{v.reason}</Copy>
              <Copy muted>Solicitada por {people.name(v.requested_by)}</Copy>
              <Badge>{decisionName(v.status)}</Badge>
            </Card>
            <Card>
              <Heading>Dos aprobaciones necesarias</Heading>
              <Copy>
                {people.name(v.other_resident_id)}: {decisionName(v.resident_decision)}
              </Copy>
              {v.resident_decided_at && <Copy muted>{displayInstant(v.resident_decided_at)}</Copy>}
              <Copy>Controlador: {decisionName(v.controller_decision)}</Copy>
              {v.controller_decided_at && (
                <Copy muted>{displayInstant(v.controller_decided_at)}</Copy>
              )}
            </Card>
            {canDecide &&
              (['APPROVED', 'REJECTED'] as const).map((decision) => (
                <Button
                  key={decision}
                  title={decision === 'APPROVED' ? 'Aprobar' : 'Rechazar'}
                  secondary={decision === 'REJECTED'}
                  busy={command.busy}
                  onPress={() =>
                    command.run({ id, decision }, () =>
                      call('decide_visit_exception', {
                        p_household: member.household_id,
                        p_exception: id,
                        p_decision: decision,
                      }),
                    )
                  }
                />
              ))}
          </>
        )}
      </QueryState>
      <ErrorText message={command.error} />
    </Shell>
  );
}
