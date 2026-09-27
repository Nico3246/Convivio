import { Redirect } from 'expo-router';
import {
  Shell,
  Card,
  Copy,
  Heading,
  Button,
  Notice,
  Loading,
  ErrorText,
} from '../src/components/ui';
import { useAuth } from '../src/features/auth/provider';
import { signInWithGoogle } from '../src/features/auth/service';
import { useCommand } from '../src/services/hooks';
import { isConfigured } from '../src/services/supabase';
export default function AccessScreen() {
  const auth = useAuth(),
    command = useCommand();
  if (auth.loading)
    return (
      <Shell title="Convivio">
        <Loading />
      </Shell>
    );
  if (auth.member) return <Redirect href="/home" />;
  return (
    <Shell title="Convivio" subtitle="Un espacio para organizar vuestra convivencia.">
      <Card>
        <Heading>Bienvenido a casa</Heading>
        <Copy>Normas claras, tareas organizadas y cuentas al día.</Copy>
        {!isConfigured ? (
          <Notice>
            La aplicación necesita la configuración inicial del administrador para poder acceder.
          </Notice>
        ) : auth.session ? (
          <>
            <Notice>
              {auth.accessError
                ? 'No se ha podido comprobar tu acceso. Comprueba la conexión y vuelve a intentarlo.'
                : 'Esta cuenta no tiene acceso autorizado al piso. Consulta con el administrador.'}
            </Notice>
            <Button
              title="Comprobar acceso"
              busy={command.busy}
              onPress={() => command.run('refresh', auth.refresh)}
            />
            <Button
              title="Usar otra cuenta de Google"
              secondary
              busy={command.busy}
              onPress={() => command.run('signout', auth.signOut)}
            />
          </>
        ) : (
          <>
            <Button
              title="Continuar con Google"
              busy={command.busy}
              onPress={() => command.run('signin', signInWithGoogle)}
            />
            <Copy muted>Solo pueden entrar las cuentas autorizadas para este piso.</Copy>
          </>
        )}
        <ErrorText message={command.error} />
      </Card>
    </Shell>
  );
}
