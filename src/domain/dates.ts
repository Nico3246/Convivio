const zone = 'Europe/Madrid';
export function dateOnly(value: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function timeOnly(value: Date): string {
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(value);
}
export function localDateTime(day: string, time = '12:00'): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}$/.test(time))
    throw new Error('Fecha no válida');
  const base = Date.parse(`${day}T${time}:00Z`);
  for (const offset of [120, 60]) {
    const candidate = new Date(base - offset * 60_000);
    if (dateOnly(candidate) === day && timeOnly(candidate) === time) return candidate;
  }
  throw new Error('Esa hora no existe por el cambio de horario. Selecciona otra.');
}
export function shiftDay(day: string, delta: number): string {
  const value = new Date(`${day}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + delta);
  return value.toISOString().slice(0, 10);
}
export function displayDay(day: string): string {
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: zone,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(localDateTime(day));
}
export function displayInstant(instant: string): string {
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: zone,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(instant));
}
export function weekday(day: string): number {
  const value = new Date(`${day}T12:00:00Z`).getUTCDay();
  return value === 0 ? 7 : value;
}
