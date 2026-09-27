import { useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import {
  Shell,
  Card,
  Copy,
  Heading,
  Button,
  Choices,
  Badge,
  Empty,
  ErrorText,
  QueryState,
  Pager,
  go,
} from '../../components/ui';
import { useAuth, useMember } from '../auth/provider';
import { useCommand, useRows } from '../../services/hooks';
import { call } from '../../services/api';
import { roleNames } from '../../domain/navigation';
import { displayInstant } from '../../domain/dates';
import { useTheme } from '../../theme/provider';
import { disableNotifications, enableNotifications } from '../notifications/service';

export function ProfileScreen() {
  const auth = useAuth(),
    member = useMember(),
    theme = useTheme(),
    command = useCommand();
  const [push, setPush] = useState(false);
  useEffect(() => {
    void SecureStore.getItemAsync('convivio.push-token')
      .then((value) => setPush(!!value))
      .catch(() => undefined);
  }, []);
  return (
    <Shell title="Mi perfil" back>
      <Card>
        <Heading>{member.display_name}</Heading>
        <Copy>{roleNames[member.role]}</Copy>
      </Card>
      <Choices
        label="Apariencia"
        value={theme.appearance}
        options={[
          { value: 'system', label: 'Sistema' },
          { value: 'light', label: 'Claro' },
          { value: 'dark', label: 'Oscuro' },
        ]}
        onChange={theme.setAppearance}
      />
      <Card>
        <Heading>Notificaciones</Heading>
        <Copy>
          Resumen semanal y decisiones de visitas. Sin avisos inmediatos de faltas o quejas.
        </Copy>
        <Copy muted>
          {push
            ? 'Solicitadas para este teléfono. Los ajustes de Android también deben permitirlas.'
            : 'No activadas desde esta instalación.'}
        </Copy>
        <Button
          title={push ? 'Desactivar avisos' : 'Activar avisos'}
          secondary
          busy={command.busy}
          onPress={async () => {
            const result = await command.run({ push: !push }, async () => {
              if (push) await disableNotifications(member);
              else await enableNotifications(member);
              return true;
            });
            if (result) setPush(!push);
          }}
        />
      </Card>
      {member.role === 'ADMIN' && <Button title="Administración" onPress={() => go('admin')} />}
      <Button
        title="Cerrar sesión"
        secondary
        busy={command.busy}
        onPress={() =>
          command.run('signout', async () => {
            try {
              await disableNotifications(member);
            } catch {
              /* A network failure must not prevent local sign-out. Push messages contain no private contents. */
            }
            await auth.signOut();
            return true;
          })
        }
      />
      <ErrorText message={command.error} />
    </Shell>
  );
}
const titles: Record<string, string> = {
  WEEKLY_REPORT: 'Resumen semanal disponible',
  EXCEPTION_REQUEST: 'Solicitud de excepción de visita',
  EXCEPTION_APPROVED: 'Excepción de visita aprobada',
  EXCEPTION_REJECTED: 'Excepción de visita rechazada',
};
export function NotificationsScreen() {
  const member = useMember(),
    command = useCommand();
  const [page, setPage] = useState(0);
  const query = useRows('notifications', { page });
  return (
    <Shell title="Notificaciones" back refresh={query.refetch}>
      <QueryState query={query}>
        {!query.data?.rows.length && <Empty text="No tienes notificaciones." />}
        {query.data?.rows.map((n) => (
          <Card key={n.id}>
            <Heading>{titles[n.kind] ?? 'Actualización de Convivio'}</Heading>
            {!n.read_at && <Badge>Sin leer</Badge>}
            <Copy muted>{displayInstant(n.created_at)}</Copy>
            <Button
              title="Consultar"
              secondary
              disabled={command.busy}
              onPress={async () => {
                await command.run(n.id, () =>
                  call('mark_notification_read', {
                    p_household: member.household_id,
                    p_notification: n.id,
                  }),
                );
                if (n.report_id) go('report', { id: n.report_id });
                else if (n.exception_id) go('visit', { id: n.exception_id });
              }}
            />
          </Card>
        ))}
        <Pager page={page} count={query.data?.count ?? 0} onChange={setPage} />
      </QueryState>
      <ErrorText message={command.error} />
    </Shell>
  );
}
