import { shiftDay, weekday } from '../../domain/dates';
import type { Row } from '../../services/database.types';

export type CalendarTask = Row<'scheduled_tasks'>;
export type CalendarShower = Row<'shower_slots'>;
export type CalendarEntry =
  | { key: string; kind: 'task'; day: string; time: string | null; task: CalendarTask }
  | { key: string; kind: 'shower'; day: string; time: string; shower: CalendarShower };

export const calendarDayNames = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo',
];
export const startOfWeek = (day: string) => shiftDay(day, 1 - weekday(day));

export function calendarDays(start: string, tasks: CalendarTask[], showers: CalendarShower[]) {
  return Array.from({ length: 7 }, (_, index) => {
    const day = shiftDay(start, index);
    const taskEntries: CalendarEntry[] = tasks
      .filter((task) => task.due_date === day)
      .map((task) => ({
        key: `task:${task.id}`,
        kind: 'task',
        day,
        time: task.due_time?.slice(0, 5) ?? null,
        task,
      }));
    const showerEntries: CalendarEntry[] = showers
      .filter((shower) => shower.weekday === weekday(day))
      .map((shower) => ({
        key: `shower:${day}:${shower.id}`,
        kind: 'shower',
        day,
        time: shower.starts_at.slice(0, 5),
        shower,
      }));
    return {
      day,
      label: calendarDayNames[index]!,
      untimed: taskEntries.filter((entry) => !entry.time),
      timed: [...taskEntries.filter((entry) => entry.time), ...showerEntries].sort(
        (a, b) => (a.time ?? '').localeCompare(b.time ?? '') || a.key.localeCompare(b.key),
      ),
    };
  });
}

export function weekLabel(start: string) {
  const end = shiftDay(start, 6);
  const formatter = new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
  const firstYear = start.slice(0, 4) !== end.slice(0, 4) ? ` ${start.slice(0, 4)}` : '';
  return `${formatter.format(new Date(`${start}T12:00:00Z`))}${firstYear} – ${formatter.format(new Date(`${end}T12:00:00Z`))} ${end.slice(0, 4)}`;
}
