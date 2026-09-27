import { useState } from 'react';
import { Alert } from 'react-native';
import { z } from 'zod';
import {
  Shell,
  Card,
  Copy,
  Heading,
  Button,
  Choices,
  Field,
  Empty,
  ErrorText,
  QueryState,
  Pager,
  Notice,
  go,
} from '../../components/ui';
import { useAuth, useMember } from '../auth/provider';
import { useCommand, usePageQuery, useRows } from '../../services/hooks';
import { AppError, call } from '../../services/api';
import { displayInstant } from '../../domain/dates';
import { roleNames, type ScreenName } from '../../domain/navigation';
import { required, useId, useParam, usePeople } from '../shared';

const adminLinks: readonly [ScreenName, string, string][] = [
  ['users', 'Usuarios', 'Cuentas, plazas y bajas'],
  ['rules', 'Normas', 'Crear y proponer cambios'],
  ['task-config', 'Tareas periódicas', 'Limpieza, basura y otras tareas'],
  ['shower-config', 'Turnos de ducha', 'Crear, editar e intercambiar'],
  ['configuration', 'Configuración del piso', 'Nombre y reglas generales'],
  ['audit', 'Registro de actividad', 'Cambios administrativos'],
];
export function AdminScreen() {
  return (
    <Shell title="Administración" back>
      {adminLinks.map(([screen, title, description]) => (
        <Card key={screen} onPress={() => go(screen)}>
          <Heading>{title}</Heading>
          <Copy muted>{description}</Copy>
        </Card>
      ))}
    </Shell>
  );
}
export function UsersScreen() {
  const member = useMember(),
    people = usePeople(),
    command = useCommand();
  const invites = usePageQuery(['invitations'], () =>
    call('list_invitations', { p_household: member.household_id }),
  );
  return (
    <Shell title="Usuarios" back refresh={people.query.refetch}>
      <Notice>
        Los roles son permanentes. Una plaza libre puede asignarse a una cuenta nueva.
      </Notice>
      <QueryState query={people.query}>
        {people.all.map((p) => (
          <Card key={p.id}>
            <Heading>{p.display_name}</Heading>
            <Copy>{roleNames[p.role]}</Copy>
            <Button
              title={p.role === 'ADMIN' ? 'Dar de baja y eliminar el piso' : 'Dar de baja'}
              secondary
              onPress={() => go('delete-member', { id: p.id })}
            />
          </Card>
        ))}
      </QueryState>
      <QueryState query={invites}>
        {invites.data?.map((i) => (
          <Card key={i.role}>
            <Heading>Acceso pendiente · {i.role ? roleNames[i.role] : ''}</Heading>
            <Copy>{i.email}</Copy>
            <Button
              title="Cancelar autorización"
              secondary
              busy={command.busy}
              onPress={() =>
                command.run({ cancel: i.role }, () =>
                  call('cancel_invitation', { p_household: member.household_id, p_role: i.role }),
                )
              }
            />
          </Card>
        ))}
        {(['RESIDENT', 'CONTROLLER'] as const).map((role) =>
          !people.all.some((p) => p.role === role) &&
          !invites.data?.some((i) => i.role === role) ? (
            <Card key={role}>
              <Heading>Plaza libre · {roleNames[role]}</Heading>
              <Button title="Autorizar nueva cuenta" onPress={() => go('invite', { role })} />
            </Card>
          ) : null,
        )}
      </QueryState>
      <ErrorText message={command.error} />
    </Shell>
  );
}
export function InviteScreen() {
  const member = useMember(),
    people = usePeople(),
    command = useCommand();
  const roleParam = useParam('role');
  const [role, setRole] = useState<'RESIDENT' | 'CONTROLLER'>(
      roleParam === 'CONTROLLER' ? 'CONTROLLER' : 'RESIDENT',
    ),
    [email, setEmail] = useState('');
  const save = async () => {
    const result = await command.run({ role, email }, async () => {
      const parsed = z.email().safeParse(email.trim().toLowerCase());
      if (!parsed.success) throw new AppError('Introduce un correo de Google válido.');
      await call('invite_replacement', {
        p_household: member.household_id,
        p_email: parsed.data,
        p_role: role,
      });
      return true;
    });
    if (result) go('users', {}, true);
  };
  return (
    <Shell title="Autorizar cuenta" back>
      <Choices
        label="Plaza"
        value={role}
        options={(
          [
            { value: 'RESIDENT', label: 'Residente' },
            { value: 'CONTROLLER', label: 'Controlador' },
          ] as const
        ).filter((o) => !people.all.some((p) => p.role === o.value))}
        onChange={setRole}
      />
      <Field
        label="Correo de Google"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={254}
      />
      <Notice>
        La persona podrá entrar con este correo en Convivio. Esta acción no envía un correo ni
        cambia roles existentes.
      </Notice>
      <ErrorText message={command.error} />
      <Button title="Autorizar acceso" busy={command.busy} onPress={save} />
    </Shell>
  );
}
const deletionResult = z.object({
  access_revoked: z.literal(true),
  physical_cleanup_pending: z.literal(true),
  household_deleted: z.boolean(),
});
export function DeleteMemberScreen() {
  const id = useId(),
    member = useMember(),
    auth = useAuth(),
    people = usePeople(),
    command = useCommand();
  const target = people.all.find((p) => p.id === id),
    [text, setText] = useState(''),
    [done, setDone] = useState(false);
  const full = target?.role === 'ADMIN',
    phrase = full ? 'ELIMINAR PISO' : 'ELIMINAR CUENTA';
  const remove = async () => {
    if (text !== phrase || !target) return;
    const result = await command.run({ delete: id, text }, async () =>
      deletionResult.parse(
        await call('delete_account', {
          p_household: member.household_id,
          p_member: id,
          p_confirmation: text,
        }),
      ),
    );
    if (!result) return;
    if (result.household_deleted) {
      Alert.alert(
        'Acceso al piso revocado',
        'Los datos del piso se han eliminado. El servidor completará el borrado de archivos y cuentas de Convivio; puede quedar pendiente de reintento.',
      );
      await auth.closeLocally();
    } else setDone(true);
  };
  return (
    <Shell title={full ? 'Eliminar piso' : 'Dar de baja'} back>
      {done ? (
        <>
          <Notice>
            Acceso revocado y registros eliminados. El borrado físico de fotografías y de la
            identidad de Convivio está pendiente del proceso del servidor.
          </Notice>
          <Button title="Volver a usuarios" onPress={() => go('users', {}, true)} />
        </>
      ) : (
        <QueryState query={people.query}>
          {!target ? (
            <Empty text="Esta cuenta no está disponible." />
          ) : (
            <>
              <Card>
                <Heading>{target.display_name}</Heading>
                <Copy>{roleNames[target.role]}</Copy>
              </Card>
              <Notice danger>
                {full
                  ? 'Dar de baja al administrador elimina el piso completo, sus tres cuentas de Convivio y todos los datos relacionados.'
                  : 'Se eliminará todo lo relacionado con esta cuenta, incluidos registros compartidos, gastos, pagos y referencias en informes.'}
              </Notice>
              <Copy>
                La eliminación es definitiva. No hay copias de seguridad propias. Las cuentas de
                Google no se borran.
              </Copy>
              <Field
                label={`Escribe ${phrase} para confirmar`}
                value={text}
                onChangeText={setText}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={30}
              />
              <ErrorText message={command.error} />
              <Button
                title={full ? 'Eliminar piso definitivamente' : 'Eliminar cuenta definitivamente'}
                danger
                disabled={text !== phrase}
                busy={command.busy}
                onPress={remove}
              />
            </>
          )}
        </QueryState>
      )}
    </Shell>
  );
}
export function ConfigurationScreen() {
  const member = useMember(),
    command = useCommand();
  const query = useRows('households', { order: 'id', size: 1 });
  const [name, setName] = useState(''),
    [saved, setSaved] = useState(false);
  return (
    <Shell title="Configuración del piso" back>
      <QueryState query={query}>
        <Card>
          <Heading>{query.data?.rows[0]?.name ?? 'Piso'}</Heading>
          <Field
            label="Nuevo nombre"
            value={name}
            onChangeText={(v) => {
              setName(v);
              setSaved(false);
            }}
            maxLength={80}
          />
          <Button
            title="Cambiar nombre"
            busy={command.busy}
            onPress={async () => {
              const result = await command.run({ name }, async () => {
                await call('rename_household', {
                  p_household: member.household_id,
                  p_name: required(name, 'Nombre', 80),
                });
                return true;
              });
              if (result) {
                setName('');
                setSaved(true);
              }
            }}
          />
          {saved && <Copy tone="success">Nombre actualizado.</Copy>}
        </Card>
      </QueryState>
      <Card>
        <Heading>Reglas del piso</Heading>
        <Copy>Zona horaria: Europe/Madrid.</Copy>
        <Copy>Resumen semanal: sábado, 12:00.</Copy>
        <Copy>Silencio: noches que empiezan de lunes a viernes, 22:00–05:30.</Copy>
        <Copy>Presencia entre semana: a partir de las 21:30.</Copy>
        <Copy>Las excepciones requieren al otro residente y al controlador.</Copy>
      </Card>
      <ErrorText message={command.error} />
    </Shell>
  );
}
const actionNames: Record<string, string> = {
  RULE_CREATED: 'Norma creada',
  RULE_CHANGE_PROPOSED: 'Cambio de norma propuesto',
  RULE_CHANGE_APPROVED: 'Cambio de norma aprobado',
  RULE_CHANGE_REJECTED: 'Cambio de norma rechazado',
  FAULT_MAINTAINED: 'Falta mantenida',
  FAULT_DELETED: 'Falta eliminada',
  DEBT_CREATED: 'Movimiento económico creado',
  DEBT_CORRECTED: 'Movimiento económico corregido',
  PAYMENT_CREATED: 'Pago registrado',
  PAYMENT_CORRECTED: 'Pago corregido',
  REPLACEMENT_INVITED: 'Acceso de nueva cuenta autorizado',
  INVITATION_CANCELLED: 'Autorización cancelada',
  HOUSEHOLD_RENAMED: 'Nombre del piso cambiado',
  SHOWER_UPDATED: 'Turno de ducha modificado',
  SHOWER_SWAPPED: 'Turnos de ducha intercambiados',
  TASK_ENABLED: 'Tarea reactivada',
  TASK_DISABLED: 'Tarea pausada',
  VISIT_REQUESTED: 'Excepción de visita solicitada',
  VISIT_DECIDED: 'Excepción de visita revisada',
};
export function AuditScreen() {
  const people = usePeople();
  const [page, setPage] = useState(0);
  const query = useRows('audit_events', { page });
  return (
    <Shell title="Registro de actividad" back refresh={query.refetch}>
      <QueryState query={query}>
        {!query.data?.rows.length && <Empty />}
        {query.data?.rows.map((e) => (
          <Card key={e.id}>
            <Heading>{actionNames[e.action] ?? 'Cambio registrado'}</Heading>
            <Copy>
              {people.name(e.actor_id)} · {displayInstant(e.created_at)}
            </Copy>
            {e.rule_id && (
              <Button
                title="Consultar norma"
                secondary
                onPress={() => go('rule', { id: e.rule_id! })}
              />
            )}
            {e.debt_id && (
              <Button
                title="Consultar movimiento"
                secondary
                onPress={() => go('expense', { id: e.debt_id! })}
              />
            )}
            {e.exception_id && (
              <Button
                title="Consultar excepción"
                secondary
                onPress={() => go('visit', { id: e.exception_id! })}
              />
            )}
          </Card>
        ))}
        <Pager page={page} count={query.data?.count ?? 0} onChange={setPage} />
      </QueryState>
    </Shell>
  );
}
