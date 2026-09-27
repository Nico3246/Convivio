import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { useMember } from '../features/auth/provider';
import { errorMessage, list, members, type ListOptions } from './api';
import type { Relation } from './database.types';

export function usePageQuery<T>(
  key: readonly unknown[],
  fetcher: (signal: AbortSignal) => Promise<T>,
) {
  const member = useMember();
  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  return useQuery({
    queryKey: ['data', member.member_id, ...key],
    queryFn: ({ signal }) => fetcher(signal),
    enabled: focused,
    refetchInterval: focused ? 30_000 : false,
  });
}
export function useRows<T extends Exclude<Relation, 'members'>>(
  table: T,
  options: ListOptions = {},
) {
  const member = useMember();
  return usePageQuery([table, options], (signal) =>
    list(table, member.household_id, options, signal),
  );
}
export function useMembers() {
  const member = useMember();
  return usePageQuery(['members'], (signal) => members(member.household_id, signal));
}
export function useCommand() {
  const cache = useQueryClient();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const running = useRef(false),
    attempt = useRef({ payload: '', key: '' });
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function run<T>(
    payload: unknown,
    execute: (requestId: string) => Promise<T>,
  ): Promise<T | undefined> {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError('');
    const fingerprint = JSON.stringify(payload);
    if (attempt.current.payload !== fingerprint)
      attempt.current = { payload: fingerprint, key: Crypto.randomUUID() };
    try {
      const value = await execute(attempt.current.key);
      await cache.invalidateQueries({ queryKey: ['data'] });
      // A confirmed action is finished. A later identical action (for example,
      // another comment) is new; only an unconfirmed retry keeps the same key.
      attempt.current = { payload: '', key: '' };
      return mounted.current ? value : undefined;
    } catch (reason) {
      if (mounted.current) setError(errorMessage(reason));
      return undefined;
    } finally {
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return { busy, error, setError, run };
}

export function useClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}
