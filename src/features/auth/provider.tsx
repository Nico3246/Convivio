import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { focusManager, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import { isConfigured, supabase } from '../../services/supabase';
import { loadMembership } from './service';
import type { Membership } from './model';

type Auth = {
  session: Session | null;
  member: Membership | null;
  loading: boolean;
  accessError: boolean;
  refresh: () => Promise<unknown>;
  signOut: () => Promise<void>;
  closeLocally: () => Promise<void>;
};
const Context = createContext<Auth | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const cache = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(isConfigured);
  const query = useQuery({
    queryKey: ['membership', session?.user.id],
    queryFn: loadMembership,
    enabled: !!session,
    refetchInterval: 30_000,
    retry: 1,
  });
  useEffect(() => {
    if (!isConfigured) return;
    const client = supabase();
    let active = true;
    let received = false;
    let identity: string | undefined;
    const update = (next: Session | null) => {
      if (!active) return;
      if (identity !== next?.user.id) {
        cache.clear();
        identity = next?.user.id;
      }
      setSession(next);
      setInitializing(false);
    };
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, next) => {
      received = true;
      update(next);
    });
    client.auth
      .getSession()
      .then(({ data }) => {
        if (!received) update(data.session);
      })
      .catch(() => {
        if (active) setInitializing(false);
      });
    const state = AppState.addEventListener('change', (value) => {
      const foreground = value === 'active';
      focusManager.setFocused(foreground);
      if (foreground) {
        client.auth.startAutoRefresh();
        void cache.invalidateQueries();
      } else client.auth.stopAutoRefresh();
    });
    if (AppState.currentState === 'active') client.auth.startAutoRefresh();
    return () => {
      active = false;
      subscription.unsubscribe();
      state.remove();
      client.auth.stopAutoRefresh();
    };
  }, [cache]);
  const member = query.data ?? null;
  useEffect(() => {
    if (session && query.isSuccess && !member) cache.removeQueries({ queryKey: ['data'] });
  }, [session, query.isSuccess, member, cache]);
  const signOut = async () => {
    const { error } = await supabase().auth.signOut({ scope: 'local' });
    if (error) throw error;
    cache.clear();
    setSession(null);
  };
  const closeLocally = async () => {
    cache.clear();
    setSession(null);
    await supabase()
      .auth.signOut({ scope: 'local' })
      .catch(() => undefined);
  };
  return (
    <Context.Provider
      value={{
        session,
        member,
        loading: initializing || (!!session && query.isPending),
        accessError: query.isError,
        refresh: query.refetch,
        signOut,
        closeLocally,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useAuth() {
  const value = useContext(Context);
  if (!value) throw new Error('AuthProvider requerido');
  return value;
}
export function useMember() {
  const { member } = useAuth();
  if (!member) throw new Error('Sesión autorizada requerida');
  return member;
}
