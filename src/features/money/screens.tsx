import { useEffect, useRef, useState } from 'react';
import {
  Shell,
  Card,
  Copy,
  Heading,
  Button,
  Choices,
  Check,
  Field,
  DateField,
  Badge,
  Empty,
  ErrorText,
  QueryState,
  Pager,
  Notice,
  go,
} from '../../components/ui';
import { useMember } from '../auth/provider';
import { useCommand, usePageQuery, useRows } from '../../services/hooks';
import { AppError, call } from '../../services/api';
import { dateOnly, displayDay, displayInstant } from '../../domain/dates';
import { expenseSplit, formatEuro, parseEuroCents } from '../../domain/money';
import { money, optionalPhoto, required, useDetail, useId, useParam, usePeople } from '../shared';
import { Attachments, PhotoPicker, usePhoto } from '../photos/components';
import type { Row } from '../../services/database.types';

const amountText = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');
export function useBalance(report?: string) {
  const member = useMember();
  return usePageQuery(['balance', report ?? 'current'], () =>
    call('money_summary', { p_household: member.household_id, p_report: report ?? null }),
  );
}
export function Balance({ report }: { report?: string }) {
  const member = useMember(),
    query = useBalance(report);
  const cents = query.data?.find((r) => r.member_id === member.member_id)?.balance_cents ?? 0;
  return (
    <QueryState query={query}>
      <Card>
        <Copy muted>{report ? 'Tu saldo al cierre' : 'Tu balance neto'}</Copy>
        <Heading>{formatEuro(Math.abs(cents))}</Heading>
        <Copy>{cents > 0 ? 'Te deben' : cents < 0 ? 'Debes' : 'Estáis al día'}</Copy>
        <Copy muted>Los pagos se registran en cada deuda.</Copy>
      </Card>
    </QueryState>
  );
}
export function MoneyScreen() {
  const [filter, setFilter] = useState('ALL'),
    [page, setPage] = useState(0);
  const people = usePeople();
  const query = useRows('debt_balances', {
    filters: filter === 'PENDING' ? [{ column: 'pending_cents', operator: 'gt', value: 0 }] : [],
    page,
  });
  return (
    <Shell title="Dinero" active="money" refresh={query.refetch}>
      <Balance />
      <Button title="Registrar gasto" onPress={() => go('expense-new')} />
      <Button
        title="Añadir deuda manual"
        secondary
        onPress={() => go('expense-new', { kind: 'MANUAL' })}
      />
      <Choices
        value={filter}
        options={[
          { value: 'ALL', label: 'Todos los movimientos' },
          { value: 'PENDING', label: 'Deudas pendientes' },
        ]}
        onChange={(v) => {
          setFilter(v);
          setPage(0);
        }}
      />
      <QueryState query={query}>
        {!query.data?.rows.length && <Empty text="No hay movimientos en esta vista." />}
        {query.data?.rows.map((d) => (
          <Card key={d.id} onPress={() => go('expense', { id: d.id })}>
            <Heading>{d.concept}</Heading>
            <Copy>
              {formatEuro(d.total_cents)} · {d.kind === 'EXPENSE' ? 'Gasto' : 'Deuda manual'}
            </Copy>
            <Copy muted>
              {displayDay(d.occurred_on)} · {people.name(d.creditor_id)}
              {d.kind === 'EXPENSE' ? ' pagó' : ''}
            </Copy>
            {d.debtor_id ? (
              <Copy>
                {people.name(d.debtor_id)} debe {formatEuro(d.pending_cents)}
              </Copy>
            ) : (
              <Copy muted>Gasto personal, sin deuda</Copy>
            )}
            {d.current_version > 1 && <Badge>Corregido · versión {d.current_version}</Badge>}
          </Card>
        ))}
        <Pager page={page} count={query.data?.count ?? 0} onChange={setPage} />
      </QueryState>
    </Shell>
  );
}
function PaymentCard({ payment }: { payment: Row<'current_payments'> }) {
  const people = usePeople();
  const [expanded, setExpanded] = useState(false),
    [page, setPage] = useState(0);
  const versions = useRows('payment_versions', {
    filters: [{ column: 'payment_id', value: payment.id }],
    order: 'version',
    page,
  });
  return (
    <Card>
      <Heading>Pago · {formatEuro(payment.amount_cents)}</Heading>
      <Copy muted>
        {displayDay(payment.occurred_on)} · {people.name(payment.recorded_by)}
      </Copy>
      {payment.current_version > 1 && <Badge>Corregido · versión {payment.current_version}</Badge>}
      <Button
        title="Corregir pago"
        secondary
        onPress={() => go('payment-new', { id: payment.debt_id, payment: payment.id })}
      />
      <Button
        title={expanded ? 'Ocultar historial' : 'Ver historial del pago'}
        secondary
        onPress={() => setExpanded(!expanded)}
      />
      {expanded && (
        <QueryState query={versions}>
          {versions.data?.rows.map((v) => (
            <Card key={v.id}>
              <Copy strong>
                Versión {v.version}: {formatEuro(v.amount_cents)}
              </Copy>
              <Copy>Fecha del pago: {displayDay(v.occurred_on)}</Copy>
              <Copy muted>
                Registrado {displayInstant(v.created_at)} por {people.name(v.recorded_by)}
              </Copy>
              {v.correction_reason && <Copy>Motivo: {v.correction_reason}</Copy>}
              <Button
                title="Ver deuda asociada"
                secondary
                onPress={() => go('expense', { id: v.debt_id })}
              />
            </Card>
          ))}
          <Pager page={page} count={versions.data?.count ?? 0} onChange={setPage} />
        </QueryState>
      )}
    </Card>
  );
}
export function ExpenseScreen() {
  const id = useId(),
    people = usePeople();
  const query = useDetail('debt_balances', id),
    debt = query.data?.rows[0];
  const [versionPage, setVersionPage] = useState(0),
    [paymentPage, setPaymentPage] = useState(0);
  const versions = useRows('debt_versions', {
    filters: [{ column: 'debt_id', value: id }],
    order: 'version',
    page: versionPage,
  });
  const payments = useRows('current_payments', {
    filters: [{ column: 'debt_id', value: id }],
    page: paymentPage,
  });
  return (
    <Shell title={debt?.concept ?? 'Movimiento'} back refresh={query.refetch}>
      <QueryState query={query}>
        {!debt ? (
          <Empty text="Este movimiento no está disponible." />
        ) : (
          <>
            <Card>
              <Badge>
                {debt.kind === 'EXPENSE' ? 'Gasto' : 'Deuda manual'} · versión{' '}
                {debt.current_version}
              </Badge>
              <Heading>{formatEuro(debt.total_cents)}</Heading>
              <Copy>Fecha: {displayDay(debt.occurred_on)}</Copy>
              <Copy>
                {debt.kind === 'EXPENSE' ? 'Pagó' : 'Acreedor'}: {people.name(debt.creditor_id)}
              </Copy>
              {debt.debtor_id ? (
                <>
                  <Copy>Deudor: {people.name(debt.debtor_id)}</Copy>
                  <Copy>Deuda inicial: {formatEuro(debt.debt_cents)}</Copy>
                  <Copy>Pagado: {formatEuro(debt.paid_cents)}</Copy>
                  <Copy strong>Pendiente: {formatEuro(debt.pending_cents)}</Copy>
                </>
              ) : (
                <Copy>Solo participa el pagador. No genera deuda.</Copy>
              )}
              {debt.products && <Copy>Productos: {debt.products}</Copy>}
            </Card>
            <Button
              title="Corregir movimiento"
              secondary
              onPress={() => go('expense-new', { id, kind: debt.kind })}
            />
            {debt.pending_cents > 0 && (
              <Button title="Registrar pago" onPress={() => go('payment-new', { id })} />
            )}
            {debt.kind === 'EXPENSE' && <Attachments kind="EXPENSE" id={id} canAdd={true} />}
            <Heading>Pagos</Heading>
            <QueryState query={payments}>
              {!payments.data?.rows.length && <Empty text="No hay pagos asociados." />}
              {payments.data?.rows.map((p) => (
                <PaymentCard key={p.id} payment={p} />
              ))}
              <Pager
                page={paymentPage}
                count={payments.data?.count ?? 0}
                onChange={setPaymentPage}
              />
            </QueryState>
            <Heading>Historial del movimiento</Heading>
            <QueryState query={versions}>
              {versions.data?.rows.map((v) => (
                <Card key={v.id}>
                  <Heading>
                    Versión {v.version} · {formatEuro(v.total_cents)}
                  </Heading>
                  <Copy>{v.concept}</Copy>
                  <Copy>
                    {people.name(v.creditor_id)} · deuda {formatEuro(v.debt_cents)}
                    {v.debtor_id ? ` de ${people.name(v.debtor_id)}` : ''}
                  </Copy>
                  <Copy>Fecha del movimiento: {displayDay(v.occurred_on)}</Copy>
                  <Copy muted>
                    Registrado {displayInstant(v.created_at)} por {people.name(v.recorded_by)}
                  </Copy>
                  {v.products && <Copy>{v.products}</Copy>}
                  {v.correction_reason && <Copy>Motivo: {v.correction_reason}</Copy>}
                </Card>
              ))}
              <Pager
                page={versionPage}
                count={versions.data?.count ?? 0}
                onChange={setVersionPage}
              />
            </QueryState>
          </>
        )}
      </QueryState>
    </Shell>
  );
}
export function ExpenseFormScreen() {
  const rawId = useParam('id'),
    id = useId(),
    people = usePeople();
  const query = useDetail('debt_balances', id);
  if (people.query.isPending || people.query.isError)
    return (
      <Shell title="Cargando formulario" back>
        <QueryState query={people.query}>{null}</QueryState>
      </Shell>
    );
  if (rawId && (query.isPending || query.isError || !query.data?.rows[0]))
    return (
      <Shell title="Corregir movimiento" back>
        <QueryState query={query}>
          <Empty text="Este movimiento no está disponible." />
        </QueryState>
      </Shell>
    );
  return (
    <ExpenseEditor
      original={rawId ? (query.data?.rows[0] ?? null) : null}
      initialParticipants={people.residents.map((p) => p.id)}
    />
  );
}
function ExpenseEditor({
  original,
  initialParticipants,
}: {
  original: Row<'debt_balances'> | null;
  initialParticipants: string[];
}) {
  const rawId = useParam('id'),
    id = useId(),
    kind = useParam('kind') === 'MANUAL' ? 'MANUAL' : 'EXPENSE',
    member = useMember(),
    people = usePeople(),
    command = useCommand(),
    photo = usePhoto();
  const [version] = useState(original?.current_version ?? null),
    [concept, setConcept] = useState(original?.concept ?? ''),
    [amount, setAmount] = useState(original ? amountText(original.total_cents) : ''),
    [payer, setPayer] = useState(original?.creditor_id ?? member.member_id),
    [participants, setParticipants] = useState<string[]>(
      original
        ? [
            ...(original.payer_participates ? [original.creditor_id] : []),
            ...(original.debtor_id ? [original.debtor_id] : []),
          ]
        : initialParticipants,
    ),
    [date, setDate] = useState(original?.occurred_on ?? dateOnly()),
    [products, setProducts] = useState(original?.products ?? ''),
    [reason, setReason] = useState('');
  let split: ReturnType<typeof expenseSplit> | null = null;
  try {
    split = expenseSplit(parseEuroCents(amount), payer, participants);
  } catch {}
  const save = async () => {
    const result = await command.run(
      { rawId, version, kind, concept, amount, payer, participants, date, products, reason },
      async (key) => {
        if (rawId && version === null) throw new AppError('Espera a que se cargue el movimiento.');
        const total = money(amount, !!rawId),
          title = required(concept, 'Concepto', 200),
          why = rawId ? required(reason, 'Motivo de la corrección', 2000) : null;
        let saved: string;
        if (kind === 'MANUAL') {
          const debtor = people.residents.find((p) => p.id !== payer);
          if (!debtor) throw new AppError('Deben estar dadas de alta las dos cuentas residentes.');
          saved = await call('save_debt', {
            p_household: member.household_id,
            p_kind: 'MANUAL',
            p_creditor: payer,
            p_debtor: debtor.id,
            p_total_cents: total,
            p_concept: title,
            p_occurred_on: date,
            p_request_id: key,
            p_debt_id: rawId ? id : null,
            p_expected_version: version,
            p_reason: why,
          });
        } else {
          if (participants.length === 0) throw new AppError('Selecciona al menos un participante.');
          saved = await call('save_expense', {
            p_household: member.household_id,
            p_payer: payer,
            p_participants: participants,
            p_total_cents: total,
            p_concept: title,
            p_occurred_on: date,
            p_products: products.trim(),
            p_request_id: key,
            p_expense_id: rawId ? id : null,
            p_expected_version: version,
            p_reason: why,
          });
        }
        await optionalPhoto(member.household_id, 'EXPENSE', saved, photo.photo);
        return saved;
      },
    );
    if (result) go('expense', { id: result }, true);
  };
  return (
    <Shell
      title={rawId ? 'Corregir movimiento' : kind === 'MANUAL' ? 'Añadir deuda' : 'Registrar gasto'}
      back
    >
      <Field label="Concepto" value={concept} onChangeText={setConcept} maxLength={200} />
      <Field
        label="Importe (€)"
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        maxLength={12}
        placeholder="0,00"
      />
      <QueryState query={people.query}>
        <Choices
          label={kind === 'MANUAL' ? '¿A quién se debe?' : '¿Quién ha pagado?'}
          value={payer}
          options={people.residents.map((p) => ({ value: p.id, label: p.display_name }))}
          onChange={setPayer}
        />
        {kind === 'EXPENSE' && (
          <Card>
            <Heading>¿Quién participa?</Heading>
            {people.residents.map((p) => (
              <Check
                key={p.id}
                label={p.display_name}
                value={participants.includes(p.id)}
                onChange={(checked) =>
                  setParticipants((old) =>
                    checked ? [...old, p.id] : old.filter((v) => v !== p.id),
                  )
                }
              />
            ))}
          </Card>
        )}
      </QueryState>
      {kind === 'EXPENSE' && split && (
        <Notice>
          {participants.includes(payer)
            ? `${people.name(payer)}: ${formatEuro(split.payerCents)}. `
            : ''}
          {split.debtorId
            ? `${people.name(split.debtorId)} debe ${formatEuro(split.debtCents)} a ${people.name(payer)}.`
            : 'Este gasto no genera deuda.'}
        </Notice>
      )}
      {kind === 'MANUAL' && (
        <Notice>
          {people.name(people.residents.find((p) => p.id !== payer)?.id)} debe {amount || '0'} € a{' '}
          {people.name(payer)}.
        </Notice>
      )}
      <DateField label="Fecha del movimiento" mode="date" value={date} onChange={setDate} />
      {kind === 'EXPENSE' && (
        <Field
          label="Productos (opcional)"
          value={products}
          onChangeText={setProducts}
          multiline
          maxLength={3000}
        />
      )}
      {kind === 'EXPENSE' && <PhotoPicker photo={photo.photo} onChange={photo.setPhoto} />}
      {rawId && (
        <>
          <Field
            label="Motivo de la corrección"
            value={reason}
            onChangeText={setReason}
            multiline
            maxLength={2000}
          />
          <Notice>
            Se conservará el original. Para anularlo, introduce 0 €. Si tiene pagos, corrígelos
            primero.
          </Notice>
        </>
      )}
      <ErrorText message={command.error} />
      <Button
        title={
          rawId ? 'Guardar corrección' : kind === 'MANUAL' ? 'Registrar deuda' : 'Registrar gasto'
        }
        disabled={!!rawId && version === null}
        busy={command.busy}
        onPress={save}
      />
    </Shell>
  );
}
export function PaymentFormScreen() {
  const initialDebt = useId(),
    paymentId = useParam('payment'),
    member = useMember(),
    people = usePeople(),
    command = useCommand();
  const existing = useDetail(
    'current_payments',
    paymentId || '00000000-0000-4000-8000-000000000000',
  );
  const initialized = useRef(false);
  const [debtId, setDebtId] = useState(initialDebt),
    [amount, setAmount] = useState(''),
    [date, setDate] = useState(dateOnly()),
    [reason, setReason] = useState(''),
    [version, setVersion] = useState<number | null>(null),
    [selectDebt, setSelectDebt] = useState(false),
    [page, setPage] = useState(0);
  const selected = useDetail('debt_balances', debtId),
    debt = selected.data?.rows[0];
  const choices = useRows('debt_balances', {
    filters: [{ column: 'pending_cents', operator: 'gt', value: 0 }],
    page,
    size: 20,
  });
  useEffect(() => {
    const p = existing.data?.rows[0];
    if (paymentId && p && !initialized.current) {
      initialized.current = true;
      setVersion(p.current_version);
      setDebtId(p.debt_id);
      setAmount(amountText(p.amount_cents));
      setDate(p.occurred_on);
    }
  }, [paymentId, existing.data]);
  const save = async () => {
    const result = await command.run(
      { debtId, amount, date, reason, version, paymentId },
      (key) => {
        if (!debt) throw new AppError('Selecciona una deuda disponible.');
        return call('save_payment', {
          p_household: member.household_id,
          p_debt_id: debtId,
          p_amount_cents: money(amount, !!paymentId),
          p_occurred_on: date,
          p_request_id: key,
          p_payment_id: paymentId || null,
          p_expected_version: version,
          p_reason: paymentId ? required(reason, 'Motivo', 2000) : null,
        });
      },
    );
    if (result) go('expense', { id: debtId }, true);
  };
  return (
    <Shell title={paymentId ? 'Corregir pago' : 'Registrar pago'} back>
      {paymentId && (
        <QueryState query={existing}>
          {!existing.data?.rows.length && <Empty text="Este pago no está disponible." />}
        </QueryState>
      )}
      <QueryState query={selected}>
        {debt ? (
          <Card>
            <Heading>{debt.concept}</Heading>
            <Copy>
              {people.name(debt.debtor_id)} → {people.name(debt.creditor_id)}
            </Copy>
            <Copy>Pendiente: {formatEuro(debt.pending_cents)}</Copy>
          </Card>
        ) : (
          <Empty text="Selecciona una deuda disponible." />
        )}
      </QueryState>
      {paymentId && (
        <>
          <Button
            title={selectDebt ? 'Cerrar selector' : 'Reasignar a otra deuda'}
            secondary
            onPress={() => setSelectDebt(!selectDebt)}
          />
          {selectDebt && (
            <QueryState query={choices}>
              {choices.data?.rows.map((d) => (
                <Card
                  key={d.id}
                  onPress={() => {
                    setDebtId(d.id);
                    setSelectDebt(false);
                  }}
                >
                  <Heading>{d.concept}</Heading>
                  <Copy>{formatEuro(d.pending_cents)} pendientes</Copy>
                </Card>
              ))}
              <Pager page={page} count={choices.data?.count ?? 0} size={20} onChange={setPage} />
            </QueryState>
          )}
        </>
      )}
      <Field
        label="Importe del pago (€)"
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        maxLength={12}
      />
      {!paymentId && debt && (
        <Button
          title={`Pagar todo · ${formatEuro(debt.pending_cents)}`}
          secondary
          onPress={() => setAmount(amountText(debt.pending_cents))}
        />
      )}
      <DateField label="Fecha del pago" mode="date" value={date} onChange={setDate} />
      {paymentId && (
        <>
          <Field
            label="Motivo de la corrección"
            value={reason}
            onChangeText={setReason}
            multiline
            maxLength={2000}
          />
          <Notice>
            Para anular este pago, introduce 0 €. Su versión original seguirá en el historial.
          </Notice>
        </>
      )}
      <Notice>Registra un pago que ya se haya realizado. Convivio no mueve dinero.</Notice>
      <ErrorText message={command.error} />
      <Button
        title={paymentId ? 'Guardar corrección' : 'Registrar pago'}
        busy={command.busy}
        disabled={!!paymentId && version === null}
        onPress={save}
      />
    </Shell>
  );
}
