import { AppError, list, type Filter } from '../../services/api';
import type { Row } from '../../services/database.types';

/** Read every page, using an ID cursor so the weekly board has no page limit. */
export async function loadCalendarRows<T extends 'scheduled_tasks' | 'shower_slots'>(
  table: T,
  household: string,
  filters: Filter[],
  signal: AbortSignal,
): Promise<Row<T>[]> {
  const rows: Row<T>[] = [];
  let cursor: string | undefined;
  for (;;) {
    if (signal.aborted) throw new Error('Consulta cancelada');
    const page = await list(
      table,
      household,
      {
        filters: [
          ...filters,
          ...(cursor ? [{ column: 'id', operator: 'gt' as const, value: cursor }] : []),
        ],
        order: 'id',
        ascending: true,
        size: 200,
      },
      signal,
    );
    rows.push(...page.rows);
    if (page.count <= page.rows.length) return rows;
    if (!page.rows.length)
      throw new AppError('No se ha podido cargar el calendario completo. Vuelve a intentarlo.');
    const next = page.rows.at(-1)!.id;
    if (next === cursor)
      throw new AppError('No se ha podido cargar el calendario completo. Vuelve a intentarlo.');
    cursor = next;
  }
}
