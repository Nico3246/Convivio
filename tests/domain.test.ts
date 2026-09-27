import { expect, test } from 'vitest';
import { parseEuroCents, splitSharedExpense } from '../src/domain/money';
import { isSilencePeriod } from '../src/domain/silence';
import { requireS256 } from '../src/features/auth/pkce';
import { createHash } from 'node:crypto';

test('PKCE usa S256: vector RFC 7636 y ningún verificador en la URL enviada a Google', async () => {
  const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
  const target = await requireS256(
    `https://auth.example.test/authorize?code_challenge=${verifier}&code_challenge_method=plain`,
    async (value) => createHash('sha256').update(value).digest('base64'),
  );
  expect(new URL(target).searchParams.get('code_challenge')).toBe(
    'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
  );
  expect(new URL(target).searchParams.get('code_challenge_method')).toBe('s256');
  expect(target).not.toContain(verifier);
});

test.each(['10,01', '10.01'])('importe %s se convierte exactamente a céntimos', (value) => {
  expect(parseEuroCents(value)).toBe(1001);
  expect(splitSharedExpense(parseEuroCents(value))).toEqual({ payerCents: 500, debtorCents: 501 });
});
test.each(['1.001', '-1', 'NaN', 'Infinity', '1e2', '1,2,3', ''])(
  'rechaza importes ambiguos: %s',
  (value) => {
    expect(() => parseEuroCents(value)).toThrow();
  },
);
test.each([
  ['2026-09-21T22:00:00+02:00', true],
  ['2026-09-21T05:00:00+02:00', false],
  ['2026-09-22T05:29:00+02:00', true],
  ['2026-09-22T05:30:00+02:00', false],
  ['2026-09-25T22:00:00+02:00', true],
  ['2026-09-26T05:00:00+02:00', true],
  ['2026-09-26T22:00:00+02:00', false],
  ['2026-09-27T22:00:00+02:00', false],
])('silencio en %s = %s', (instant, expected) => {
  expect(isSilencePeriod(new Date(instant))).toBe(expected);
});
