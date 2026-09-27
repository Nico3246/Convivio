import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { completeGoogleSignIn } from '../../src/features/auth/service';
import { errorMessage } from '../../src/services/api';
import { Shell, Loading, ErrorText, Button } from '../../src/components/ui';
export default function AuthCallback() {
  const { code } = useLocalSearchParams<{ code?: string | string[] }>();
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const value = Array.isArray(code) ? code[0] : code;
    if (!value) return;
    void completeGoogleSignIn(value)
      .then(() => {
        if (active) router.replace('/');
      })
      .catch((reason) => {
        if (active) setError(errorMessage(reason));
      });
    return () => {
      active = false;
    };
  }, [code]);
  return (
    <Shell title="Completando acceso">
      {error || !code ? (
        <>
          <ErrorText
            message={error || 'El acceso no se ha completado. Puedes volver a intentarlo.'}
          />
          <Button title="Volver al inicio" onPress={() => router.replace('/')} />
        </>
      ) : (
        <Loading />
      )}
    </Shell>
  );
}
