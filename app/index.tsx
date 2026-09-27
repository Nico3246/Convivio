import { Redirect } from 'expo-router';
import { Button, Notice, Loading, ErrorText } from '../src/components/ui';
import { AccessLayout, GoogleButton } from '../src/features/auth/access-layout';
import { useAuth } from '../src/features/auth/provider';
import { signInWithGoogle } from '../src/features/auth/service';
import { useCommand } from '../src/services/hooks';
import { isConfigured } from '../src/services/supabase';
export default function AccessScreen() {
  const auth = useAuth(),
    command = useCommand();
  if (auth.loading)
    return (
      <AccessLayout>
        <Loading />
      </AccessLayout>
    );
  if (auth.member) return <Redirect href="/home" />;
  return (
    <AccessLayout>
      {!isConfigured ? (
        <Notice>El administrador debe completar la configuración del piso.</Notice>
      ) : auth.session ? (
        <>
          <Notice>
            {auth.accessError
              ? 'No se ha podido comprobar tu acceso. Vuelve a intentarlo.'
              : 'Esta cuenta no tiene acceso al piso.'}
          </Notice>
          <Button
            title="Comprobar acceso"
            busy={command.busy}
            onPress={() => command.run('refresh', auth.refresh)}
          />
          <Button
            title="Cambiar de cuenta"
            secondary
            busy={command.busy}
            onPress={() => command.run('signout', auth.signOut)}
          />
        </>
      ) : (
        <GoogleButton busy={command.busy} onPress={() => command.run('signin', signInWithGoogle)} />
      )}
      <ErrorText message={command.error} />
    </AccessLayout>
  );
}
