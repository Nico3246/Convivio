import { supabase } from './supabase';
import type { Database, Relation, Row } from './database.types';

type Functions = Database['public']['Functions'];
export class AppError extends Error {}
export function errorMessage(error: unknown): string {
  if (error instanceof AppError) return error.message;
  if (error && typeof error === 'object' && 'code' in error) {
    const e = error as { code: string; message?: string };
    if (e.code === '40001')
      return 'El registro ha cambiado. Actualiza la pantalla antes de corregirlo.';
    if (e.code === '42501')
      return 'Ya no tienes permiso para realizar esta acción. Actualiza tu sesión.';
    if (e.code === '23505') return 'Ya existe ese registro o hay una propuesta pendiente.';
    if (e.code === '22023' && e.message && !/invalid|syntax|uuid|parameter/i.test(e.message))
      return e.message;
    if (['23514', '23502', '23503', '22003'].includes(e.code))
      return 'Revisa los datos: falta un valor válido o el registro relacionado ya no existe.';
  }
  return 'No se ha podido confirmar la operación. Comprueba la conexión y vuelve a intentarlo.';
}
export async function call<K extends keyof Functions>(
  name: K,
  args: Functions[K]['Args'],
): Promise<Functions[K]['Returns']> {
  const { data, error } = await supabase().rpc(name, args);
  if (error) throw error;
  return data as Functions[K]['Returns'];
}
export type Filter = {
  column: string;
  operator?: 'eq' | 'is' | 'gte' | 'lte' | 'lt' | 'gt';
  value: string | number | boolean | null;
};
export type ListOptions = {
  filters?: Filter[];
  order?: string;
  ascending?: boolean;
  page?: number;
  size?: number;
};
function selectAll(table: Exclude<Relation, 'members'>) {
  const client = supabase();
  if (
    table === 'current_rules' ||
    table === 'current_payments' ||
    table === 'debt_balances' ||
    table === 'scheduled_tasks' ||
    table === 'fault_history' ||
    table === 'latest_rules'
  )
    return client.from(table).select('*', { count: 'exact' });
  return client.from(table).select('*', { count: 'exact' });
}
export async function list<T extends Exclude<Relation, 'members'>>(
  table: T,
  household: string,
  options: ListOptions = {},
  signal?: AbortSignal,
): Promise<{ rows: Row<T>[]; count: number }> {
  let query = selectAll(table).filter(
    table === 'households' ? 'id' : 'household_id',
    'eq',
    household,
  );
  for (const filter of options.filters ?? [])
    query = query.filter(filter.column, filter.operator ?? 'eq', filter.value);
  const size = options.size ?? 40,
    start = (options.page ?? 0) * size;
  query = query
    .order(options.order ?? 'created_at', { ascending: options.ascending ?? false })
    .order('id', { ascending: true })
    .range(start, start + size - 1);
  if (signal) query = query.abortSignal(signal);
  const result = await query;
  if (result.error) throw result.error;
  return { rows: result.data as unknown as Row<T>[], count: result.count ?? 0 };
}
export async function members(household: string, signal?: AbortSignal) {
  let query = supabase()
    .from('members')
    .select('id,household_id,role,display_name,created_at')
    .eq('household_id', household)
    .order('created_at');
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}
export type Member = Awaited<ReturnType<typeof members>>[number];
