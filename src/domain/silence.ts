// RN-02 applies to nights STARTING on Monday through Friday. Presentation only:
// Convivio never detects or reports an infringement automatically.
export function isSilencePeriod(date: Date): boolean {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(get('weekday'));
  const minutes = Number(get('hour')) * 60 + Number(get('minute'));
  return (
    (weekday >= 0 && weekday <= 4 && minutes >= 22 * 60) ||
    (weekday >= 1 && weekday <= 5 && minutes < 5 * 60 + 30)
  );
}
