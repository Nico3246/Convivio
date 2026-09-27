const MAX_CENTS = 1_000_000_000;

export function parseEuroCents(input: string): number {
  const value = input.trim();
  if (!/^\d{1,8}([,.]\d{1,2})?$/.test(value))
    throw new Error('Introduce un importe con hasta dos decimales');
  const [integer, decimals = ''] = value.replace(',', '.').split('.');
  const cents = Number(integer) * 100 + Number(decimals.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents < 0 || cents > MAX_CENTS)
    throw new Error('Importe fuera de rango');
  return cents;
}

export function splitSharedExpense(totalCents: number): {
  payerCents: number;
  debtorCents: number;
} {
  if (!Number.isSafeInteger(totalCents) || totalCents <= 0 || totalCents > MAX_CENTS)
    throw new Error('Importe no válido');
  const debtorCents = Math.ceil(totalCents / 2);
  return { payerCents: totalCents - debtorCents, debtorCents };
}

export function formatEuro(cents: number): string {
  if (!Number.isSafeInteger(cents)) throw new Error('Importe no válido');
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

export function expenseSplit(total: number, payer: string, participants: string[]) {
  if (
    !Number.isSafeInteger(total) ||
    total < 0 ||
    total > MAX_CENTS ||
    participants.length < 1 ||
    participants.length > 2 ||
    new Set(participants).size !== participants.length
  )
    throw new Error('Revisa el importe y los participantes');
  const debtorId = participants.find((id) => id !== payer) ?? null;
  const payerParticipates = participants.includes(payer);
  const debtCents = debtorId === null ? 0 : payerParticipates ? Math.ceil(total / 2) : total;
  return { debtorId, debtCents, payerCents: total - debtCents, payerParticipates };
}
