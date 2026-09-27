import { useState } from 'react';
import {
  Shell,
  Card,
  Copy,
  Heading,
  Button,
  Choices,
  Check,
  Field,
  Empty,
  ErrorText,
  QueryState,
  Pager,
  Row,
  Notice,
  go,
} from '../../components/ui';
import { useMember } from '../auth/provider';
import { useCommand, useRows } from '../../services/hooks';
import { AppError, call } from '../../services/api';
import { displayInstant } from '../../domain/dates';
import { required, scopes, useDetail, useId, useParam } from '../shared';
import type { Database } from '../../services/database.types';
type Scope = Database['public']['Enums']['inventory_scope'];
function quantity(input: string, zero = true) {
  const text = input.trim().replace(',', '.');
  if (!/^\d{1,9}(\.\d{1,3})?$/.test(text) || (!zero && Number(text) === 0))
    throw new AppError('Introduce una cantidad válida con hasta tres decimales.');
  return Number(text);
}
export function ShoppingScreen() {
  const [scope, setScope] = useState<Scope>('PERSONAL'),
    [tab, setTab] = useState('INVENTORY'),
    [page, setPage] = useState(0);
  const query = useRows(tab === 'INVENTORY' ? 'inventory_items' : 'shopping_items', {
    filters: [
      { column: 'scope', value: scope },
      ...(tab === 'LIST'
        ? [{ column: 'purchased_at', operator: 'is' as const, value: null }]
        : tab === 'HISTORY'
          ? [{ column: 'purchased_at', operator: 'gt' as const, value: '1970-01-01Z' }]
          : []),
    ],
    order: tab === 'HISTORY' ? 'purchased_at' : 'name',
    ascending: tab !== 'HISTORY',
    page,
  });
  return (
    <Shell title="Compra" active="shopping" refresh={query.refetch}>
      <Choices
        value={scope}
        options={scopes}
        onChange={(v) => {
          setScope(v);
          setPage(0);
        }}
      />
      {scope === 'PERSONAL' && <Copy muted>Solo tú puedes ver y modificar estos productos.</Copy>}
      <Choices
        value={tab}
        options={[
          { value: 'INVENTORY', label: 'Inventario' },
          { value: 'LIST', label: 'Lista de compra' },
          { value: 'HISTORY', label: 'Comprado' },
        ]}
        onChange={(v) => {
          setTab(v);
          setPage(0);
        }}
      />
      <Button
        title={tab === 'INVENTORY' ? 'Añadir producto' : 'Añadir a la lista'}
        onPress={() =>
          go('product-new', { scope, kind: tab === 'INVENTORY' ? 'INVENTORY' : 'LIST' })
        }
      />
      <QueryState query={query}>
        {!query.data?.rows.length && <Empty />}
        {query.data?.rows.map((item) => (
          <Card
            key={item.id}
            onPress={() =>
              go('product', { id: item.id, kind: tab === 'INVENTORY' ? 'INVENTORY' : 'LIST' })
            }
          >
            <Heading>{item.name}</Heading>
            <Copy>
              {item.quantity} {item.unit}
            </Copy>
            {'purchased_at' in item && item.purchased_at && (
              <Copy muted>Comprado {displayInstant(item.purchased_at)}</Copy>
            )}
          </Card>
        ))}
        <Pager page={page} count={query.data?.count ?? 0} onChange={setPage} />
      </QueryState>
    </Shell>
  );
}
export function ProductFormScreen() {
  const member = useMember(),
    command = useCommand(),
    scopeParam = useParam('scope');
  const [scope, setScope] = useState<Scope>(
      scopeParam === 'SHARED' || scopeParam === 'HOUSEHOLD' ? scopeParam : 'PERSONAL',
    ),
    [name, setName] = useState(useParam('name')),
    [amount, setAmount] = useState('1'),
    [unit, setUnit] = useState(useParam('unit') || 'ud');
  const kind = useParam('kind') === 'INVENTORY' ? 'INVENTORY' : 'LIST';
  const save = async () => {
    const result = await command.run({ scope, name, amount, unit, kind }, (key) =>
      call(kind === 'INVENTORY' ? 'add_inventory_item' : 'add_shopping_item', {
        p_household: member.household_id,
        p_scope: scope,
        p_name: required(name, 'Nombre', 120),
        p_quantity: quantity(amount, kind === 'INVENTORY'),
        p_unit: required(unit, 'Unidad', 30),
        p_request_id: key,
      }),
    );
    if (result) go('product', { id: result, kind }, true);
  };
  return (
    <Shell title={kind === 'INVENTORY' ? 'Añadir producto' : 'Añadir a la compra'} back>
      <Choices label="Dónde guardarlo" value={scope} options={scopes} onChange={setScope} />
      <Field label="Producto" value={name} onChangeText={setName} maxLength={120} />
      <Field
        label="Cantidad"
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        maxLength={13}
      />
      <Field
        label="Unidad"
        value={unit}
        onChangeText={setUnit}
        maxLength={30}
        placeholder="ud, kg, litros…"
      />
      <ErrorText message={command.error} />
      <Button title="Guardar producto" busy={command.busy} onPress={save} />
    </Shell>
  );
}
export function ProductScreen() {
  const kind = useParam('kind') === 'INVENTORY' ? 'INVENTORY' : 'LIST';
  return kind === 'INVENTORY' ? <InventoryDetail /> : <ShoppingDetail />;
}
function InventoryDetail() {
  const id = useId(),
    member = useMember(),
    command = useCommand();
  const query = useDetail('inventory_items', id),
    item = query.data?.rows[0];
  const [editing, setEditing] = useState(false),
    [amount, setAmount] = useState(''),
    [revision, setRevision] = useState(0);
  const update = async (value: number, expected: number) => {
    const result = await command.run({ id, value, expected }, () =>
      call('set_inventory_quantity', {
        p_household: member.household_id,
        p_item: id,
        p_quantity: value,
        p_expected_revision: expected,
      }),
    );
    if (result) setEditing(false);
  };
  return (
    <Shell title={item?.name ?? 'Producto'} back refresh={query.refetch}>
      <QueryState query={query}>
        {!item ? (
          <Empty text="Este producto no está disponible." />
        ) : (
          <>
            <Card>
              <Copy muted>{scopes.find((s) => s.value === item.scope)?.label}</Copy>
              <Heading>
                {item.quantity} {item.unit}
              </Heading>
              <Row>
                <Button
                  title="− 1"
                  secondary
                  disabled={command.busy || item.quantity === 0}
                  onPress={() => update(Math.max(0, Number(item.quantity) - 1), item.revision)}
                />
                <Button
                  title="+ 1"
                  secondary
                  disabled={command.busy}
                  onPress={() => update(Number(item.quantity) + 1, item.revision)}
                />
              </Row>
              <Button
                title="Cambiar cantidad"
                secondary
                onPress={() => {
                  setEditing(true);
                  setAmount(String(item.quantity));
                  setRevision(item.revision);
                  command.setError('');
                }}
              />
              {editing && (
                <>
                  <Field
                    label="Nueva cantidad"
                    value={amount}
                    onChangeText={setAmount}
                    keyboardType="decimal-pad"
                    maxLength={13}
                  />
                  <Button
                    title="Guardar cantidad"
                    busy={command.busy}
                    onPress={async () => {
                      try {
                        await update(quantity(amount), revision);
                      } catch (e) {
                        command.setError(e instanceof Error ? e.message : 'Cantidad no válida');
                      }
                    }}
                  />
                </>
              )}
            </Card>
            {item.quantity === 0 && (
              <Notice>Se ha agotado. Puedes añadirlo a tu lista de compra.</Notice>
            )}
            <Button
              title="Añadir a la lista de compra"
              onPress={() =>
                go('product-new', {
                  scope: item.scope,
                  kind: 'LIST',
                  name: item.name,
                  unit: item.unit,
                })
              }
            />
          </>
        )}
      </QueryState>
      <ErrorText message={command.error} />
    </Shell>
  );
}
function ShoppingDetail() {
  const id = useId(),
    member = useMember(),
    command = useCommand();
  const query = useDetail('shopping_items', id),
    item = query.data?.rows[0];
  const [stock, setStock] = useState(true);
  return (
    <Shell title={item?.name ?? 'Producto de la lista'} back refresh={query.refetch}>
      <QueryState query={query}>
        {!item ? (
          <Empty text="Este producto no está disponible." />
        ) : (
          <Card>
            <Heading>
              {item.quantity} {item.unit}
            </Heading>
            <Copy>{scopes.find((s) => s.value === item.scope)?.label}</Copy>
            {item.purchased_at ? (
              <Copy>Comprado {displayInstant(item.purchased_at)}</Copy>
            ) : (
              <>
                <Check label="Añadir también al inventario" value={stock} onChange={setStock} />
                <Button
                  title="Marcar comprado"
                  busy={command.busy}
                  onPress={() =>
                    command.run({ id, stock }, () =>
                      call('buy_and_stock_item', {
                        p_household: member.household_id,
                        p_item: id,
                        p_add_to_inventory: stock,
                      }),
                    )
                  }
                />
              </>
            )}
          </Card>
        )}
      </QueryState>
      <ErrorText message={command.error} />
    </Shell>
  );
}
