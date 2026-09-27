import { randomUUID } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { asUser, database, ids, scalar, seed } from './database';
let db: PGlite;
beforeAll(async () => {
  db = await database();
});
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  await db.exec(
    'truncate public.households,auth.users,private.cleanup_queue,storage.objects cascade',
  );
  await seed(db);
});
const run = <T = unknown>(user: string, sql: string, args: unknown[] = []) =>
  asUser(db, user, (tx) => scalar<T>(tx, sql, args));
const expense = (
  participants: string[] = [ids.admin, ids.resident],
  total = 1001,
  key = randomUUID(),
  existing: string | null = null,
  version: number | null = null,
) =>
  run<string>(
    ids.authAdmin,
    "select public.save_expense($1,$2,$3,$4,'Compra','2026-01-01','Lista de productos',$5,$6,$7,$8)",
    [
      ids.house,
      ids.admin,
      participants,
      total,
      key,
      existing,
      version,
      existing ? 'Corrección' : null,
    ],
  );
const shower = (who: string, day = 1, start = '07:00', end = '07:30') =>
  run<string>(ids.authAdmin, 'select public.create_shower_slot($1,$2,$3,$4,$5,$6)', [
    ids.house,
    who,
    day,
    start,
    end,
    randomUUID(),
  ]);
const visit = () =>
  run<string>(
    ids.authAdmin,
    "select public.request_visit_exception($1,'Visitante','Motivo','BOTH',now()+interval '1 day',now()+interval '2 days',$2)",
    [ids.house, randomUUID()],
  );
const report = () =>
  scalar<string>(db, "select public.generate_weekly_report($1,'2026-09-19T10:00:00Z')", [
    ids.house,
  ]);

describe('participantes, balances e historia económica', () => {
  test.each([
    [[ids.admin], 0, null],
    [[ids.resident], 1001, ids.resident],
    [[ids.admin, ids.resident], 501, ids.resident],
  ] as const)(
    'reparte los participantes %j sin inventar deuda',
    async (participants, cents, debtor) => {
      const id = await expense([...participants]);
      const row = (await db.query('select * from public.debt_balances where id=$1', [id])).rows[0];
      expect(row).toMatchObject({ debt_cents: cents, debtor_id: debtor, total_cents: 1001 });
    },
  );
  test('rechaza cero participantes, repetidos y el controlador como participante', async () => {
    for (const values of [[], [ids.admin, ids.admin], [ids.controller]])
      await expect(expense(values)).rejects.toThrow('Datos del gasto');
  });
  test('reintenta una corrección sin duplicarla y conserva el gasto personal original', async () => {
    const id = await expense([ids.admin]);
    const key = randomUUID();
    await expense([ids.admin, ids.resident], 1001, key, id, 1);
    await expense([ids.admin, ids.resident], 1001, key, id, 1);
    expect(
      await scalar(db, 'select count(*)::int from public.debt_versions where debt_id=$1', [id]),
    ).toBe(2);
    expect(
      await scalar(
        db,
        'select debt_cents::int from public.debt_versions where debt_id=$1 and version=1',
        [id],
      ),
    ).toBe(0);
    await expect(expense([ids.admin], 2000, randomUUID(), id, 1)).rejects.toThrow('cambió');
  });
  test('los pagos impiden convertir el gasto en personal hasta corregirlos', async () => {
    const id = await expense();
    await run(ids.authResident, "select public.save_payment($1,$2,100,'2026-01-01',$3)", [
      ids.house,
      id,
      randomUUID(),
    ]);
    await expect(expense([ids.admin], 1001, randomUUID(), id, 1)).rejects.toThrow(
      'Corrige primero',
    );
  });
  test('el balance agrega más de una página y el controlador no puede consultarlo', async () => {
    for (let i = 0; i < 45; i++) await expense([ids.admin, ids.resident], 2);
    const result = await asUser(db, ids.authAdmin, (tx) =>
      tx.query('select * from public.money_summary($1)', [ids.house]),
    );
    expect(result.rows).toContainEqual({ member_id: ids.admin, balance_cents: 45 });
    expect(result.rows).toContainEqual({ member_id: ids.resident, balance_cents: -45 });
    expect(
      await run(ids.authController, 'select count(*)::int from public.money_summary($1)', [
        ids.house,
      ]),
    ).toBe(0);
    expect(
      await run(ids.authOutsider, 'select count(*)::int from public.money_summary($1)', [
        ids.house,
      ]),
    ).toBe(0);
  });
  test('el saldo de un informe mantiene las versiones originales tras corregir gasto y pago', async () => {
    const id = await expense();
    const payment = await run<string>(
      ids.authResident,
      "select public.save_payment($1,$2,100,'2026-01-01',$3)",
      [ids.house, id, randomUUID()],
    );
    await db.exec(
      "update public.debt_versions set created_at='2026-09-18Z';update public.payment_versions set created_at='2026-09-18Z'",
    );
    const r = await report();
    await expense([ids.admin, ids.resident], 2000, randomUUID(), id, 1);
    await run(
      ids.authAdmin,
      "select public.save_payment($1,$2,200,'2026-01-01',$3,$4,1,'Error de importe')",
      [ids.house, id, randomUUID(), payment],
    );
    expect(
      await run(
        ids.authAdmin,
        'select balance_cents::int from public.money_summary($1,$2) where member_id=$3',
        [ids.house, r, ids.admin],
      ),
    ).toBe(401);
    expect(
      await run(
        ids.authAdmin,
        'select balance_cents::int from public.money_summary($1) where member_id=$2',
        [ids.house, ids.admin],
      ),
    ).toBe(800);
    await run(ids.authAdmin, "select public.delete_account($1,$2,'ELIMINAR CUENTA')", [
      ids.house,
      ids.resident,
    ]);
    expect(await scalar(db, 'select count(*)::int from public.debt_versions')).toBe(0);
    expect(
      await scalar(db, 'select count(*)::int from public.report_entries where report_id=$1', [r]),
    ).toBe(0);
  });
});

describe('turnos, compras y privacidad del informe', () => {
  test('solo admin puede editar/intercambiar turnos y una revisión antigua no sobrescribe otra', async () => {
    const a = await shower(ids.admin),
      b = await shower(ids.resident, 1, '07:30', '08:00');
    await expect(
      run(ids.authResident, "select public.edit_shower_slot($1,$2,$3,1,'08:00','08:30',1)", [
        ids.house,
        a,
        ids.resident,
      ]),
    ).rejects.toThrow('Acceso');
    await run(ids.authAdmin, 'select public.swap_shower_slots($1,$2,$3,1,1)', [ids.house, a, b]);
    expect(await scalar(db, 'select resident_id from public.shower_slots where id=$1', [a])).toBe(
      ids.resident,
    );
    await expect(
      run(ids.authAdmin, 'select public.swap_shower_slots($1,$2,$3,1,1)', [ids.house, a, b]),
    ).rejects.toThrow('cambió');
    expect(await scalar(db, 'select count(*)::int from public.shower_versions')).toBe(4);
  });
  test('un informe conserva el turno anterior a una edición', async () => {
    const a = await shower(ids.admin);
    await db.exec("update public.shower_versions set created_at='2026-09-18Z'");
    const r = await report();
    await run(ids.authAdmin, "select public.edit_shower_slot($1,$2,$3,2,'09:00','09:30',1)", [
      ids.house,
      a,
      ids.resident,
    ]);
    expect(
      await scalar(
        db,
        'select s.weekday from public.report_entries e join public.shower_versions s on e.shower_version_id=s.id where e.report_id=$1',
        [r],
      ),
    ).toBe(1);
    expect(
      await run(
        ids.authController,
        'select count(*)::int from public.report_entries where report_id=$1',
        [r],
      ),
    ).toBe(0);
  });
  test('comprar y pasar al inventario es atómico e idempotente', async () => {
    const id = await run<string>(
      ids.authResident,
      "select public.add_shopping_item($1,'PERSONAL','Leche',2,'L',$2)",
      [ids.house, randomUUID()],
    );
    await expect(
      run(ids.authAdmin, 'select public.buy_and_stock_item($1,$2,true)', [ids.house, id]),
    ).rejects.toThrow('Producto no disponible');
    await run(ids.authResident, 'select public.buy_and_stock_item($1,$2,true)', [ids.house, id]);
    await run(ids.authResident, 'select public.buy_and_stock_item($1,$2,true)', [ids.house, id]);
    expect(await scalar(db, 'select count(*)::int from public.inventory_items')).toBe(1);
    expect(await run(ids.authAdmin, 'select count(*)::int from public.inventory_items')).toBe(0);
  });
  test('las referencias de compras personales siguen ocultas al otro residente y controlador', async () => {
    await run(
      ids.authResident,
      "select public.add_shopping_item($1,'PERSONAL','Producto privado',1,'ud',$2)",
      [ids.house, randomUUID()],
    );
    await run(
      ids.authAdmin,
      "select public.add_shopping_item($1,'SHARED','Producto común',1,'ud',$2)",
      [ids.house, randomUUID()],
    );
    await db.exec("update public.shopping_items set created_at='2026-09-18Z'");
    const r = await report();
    expect(
      await run(
        ids.authResident,
        'select count(*)::int from public.report_entries where report_id=$1',
        [r],
      ),
    ).toBe(2);
    expect(
      await run(
        ids.authAdmin,
        'select count(*)::int from public.report_entries where report_id=$1',
        [r],
      ),
    ).toBe(1);
    expect(
      await run(
        ids.authController,
        'select count(*)::int from public.report_entries where report_id=$1',
        [r],
      ),
    ).toBe(0);
  });
});

describe('reserva de fotografías y revocación', () => {
  async function fault() {
    const rule = await run<string>(
      ids.authAdmin,
      "select public.create_rule($1,'Silencio','HOURS','Regla','2025-01-01Z',$2)",
      [ids.house, randomUUID()],
    );
    return run<string>(
      ids.authResident,
      "select public.register_fault($1,$2,$3,'2026-01-01Z','Hecho privado',$4)",
      [ids.house, ids.admin, rule, randomUUID()],
    );
  }
  test('solo el autor reserva evidencia y no se puede confirmar antes de subirla', async () => {
    const f = await fault();
    await expect(
      run(ids.authAdmin, "select public.reserve_attachment($1,'FAULT',$2,$3)", [
        ids.house,
        f,
        randomUUID(),
      ]),
    ).rejects.toThrow('No puedes');
    const key = randomUUID(),
      a = await run<string>(
        ids.authResident,
        "select public.reserve_attachment($1,'FAULT',$2,$3)",
        [ids.house, f, key],
      );
    expect(
      await run(ids.authResident, "select public.reserve_attachment($1,'FAULT',$2,$3)", [
        ids.house,
        f,
        key,
      ]),
    ).toBe(a);
    await expect(
      run(ids.authResident, 'select public.finish_attachment($1,$2)', [ids.house, a]),
    ).rejects.toThrow('no ha terminado');
    await asUser(db, ids.authResident, (tx) =>
      tx.query(
        'insert into storage.objects(bucket_id,name) select bucket,object_path from public.attachments where id=$1',
        [a],
      ),
    );
    await run(ids.authResident, 'select public.finish_attachment($1,$2)', [ids.house, a]);
    expect(
      await scalar(db, 'select uploaded_at is not null from public.attachments where id=$1', [a]),
    ).toBe(true);
    await run(ids.authController, 'select public.delete_fault($1,$2,$3)', [
      ids.house,
      f,
      randomUUID(),
    ]);
    expect(await run(ids.authResident, 'select count(*)::int from storage.objects')).toBe(0);
    expect(
      await scalar(
        db,
        "select available_at>now()+interval '14 minutes' from private.cleanup_queue where kind='STORAGE'",
      ),
    ).toBe(true);
  });
  test('una reserva caducada bloquea nuevas subidas y el barrido programa objetos huérfanos', async () => {
    const f = await fault();
    const a = await run<string>(
      ids.authResident,
      "select public.reserve_attachment($1,'FAULT',$2,$3)",
      [ids.house, f, randomUUID()],
    );
    await db.query(
      "update public.attachments set upload_expires_at=now()-interval '2 hours' where id=$1",
      [a],
    );
    await expect(
      asUser(db, ids.authResident, (tx) =>
        tx.query(
          'insert into storage.objects(bucket_id,name) select bucket,object_path from public.attachments where id=$1',
          [a],
        ),
      ),
    ).rejects.toThrow();
    await db.exec(
      "insert into storage.objects(bucket_id,name) values('fault-evidence','orphan.jpg');select public.cleanup_attachment_reservations()",
    );
    expect(await scalar(db, 'select count(*)::int from public.attachments')).toBe(0);
    expect(
      await scalar(
        db,
        "select count(*)::int from private.cleanup_queue where object_path='orphan.jpg'",
      ),
    ).toBe(1);
  });
  test('las estadísticas y fotografías desaparecen al eliminar la falta', async () => {
    const f = await fault();
    expect(
      await run(ids.authController, "select total::int from public.fault_statistics($1,'ALL')", [
        ids.house,
      ]),
    ).toBe(1);
    expect(
      await run(
        ids.authController,
        "select sum(total)::int from public.fault_monthly($1,'2026-09-01')",
        [ids.house],
      ),
    ).toBe(1);
    await run(ids.authController, 'select public.delete_fault($1,$2,$3)', [
      ids.house,
      f,
      randomUUID(),
    ]);
    expect(await run(ids.authController, 'select count(*)::int from public.fault_history')).toBe(0);
    expect(
      await run(ids.authController, "select count(*)::int from public.fault_statistics($1,'ALL')", [
        ids.house,
      ]),
    ).toBe(0);
  });
});

describe('cola push privada y acuses de entrega', () => {
  test('solo los avisos previstos generan envíos; un ticket no confirma la entrega', async () => {
    await run(
      ids.authController,
      "select public.register_push_token($1,'ExponentPushToken[controller]')",
      [ids.house],
    );
    await visit();
    expect(await scalar(db, 'select count(*)::int from private.push_deliveries')).toBe(1);
    await expect(
      run(ids.authController, 'select public.claim_push_deliveries()'),
    ).rejects.toThrow();
    const jobs = (
      await db.query<{ id: string; lease_id: string }>(
        'select * from public.claim_push_deliveries()',
      )
    ).rows;
    const j = jobs[0]!;
    await db.query("select public.finish_push_delivery($1,$2,'TICKET','expo-ticket')", [
      j.id,
      j.lease_id,
    ]);
    expect(
      await scalar(
        db,
        "select delivered_at is null and available_at>now()+interval '14 minutes' from private.push_deliveries",
      ),
    ).toBe(true);
    await db.exec("update private.push_deliveries set available_at=now()-interval '1 minute'");
    const claimed = (
      await db.query<{ id: string; lease_id: string }>(
        'select * from public.claim_push_deliveries()',
      )
    ).rows[0]!;
    await db.query("select public.finish_push_delivery($1,$2,'OK')", [claimed.id, randomUUID()]);
    expect(await scalar(db, 'select delivered_at is null from private.push_deliveries')).toBe(true);
    await db.query("select public.finish_push_delivery($1,$2,'OK')", [
      claimed.id,
      claimed.lease_id,
    ]);
    expect(await scalar(db, 'select delivered_at is not null from private.push_deliveries')).toBe(
      true,
    );
  });
  test('reasignar un teléfono elimina los envíos pendientes de su cuenta anterior', async () => {
    await run(
      ids.authController,
      "select public.register_push_token($1,'ExpoPushToken[same_device]')",
      [ids.house],
    );
    await visit();
    await run(
      ids.authResident,
      "select public.register_push_token($1,'ExpoPushToken[same_device]')",
      [ids.house],
    );
    expect(await scalar(db, 'select count(*)::int from private.push_deliveries')).toBe(0);
    expect(await scalar(db, 'select member_id from private.push_tokens')).toBe(ids.resident);
    await run(
      ids.authAdmin,
      "select public.unregister_push_token($1,'ExpoPushToken[same_device]')",
      [ids.house],
    );
    expect(await scalar(db, 'select count(*)::int from private.push_tokens')).toBe(1);
  });
});

test('un formulario antiguo no propone cambios sobre una norma recién aprobada', async () => {
  const r = await run<string>(
    ids.authAdmin,
    "select public.create_rule($1,'Norma','HOURS','Inicial','2025-01-01Z',$2)",
    [ids.house, randomUUID()],
  );
  const key = randomUUID();
  const p = await run<string>(
    ids.authAdmin,
    "select public.propose_rule_change($1,$2,'Norma','HOURS','Nuevo','',$3,1)",
    [ids.house, r, key],
  );
  await run(ids.authController, "select public.decide_rule_change($1,$2,'APPROVED')", [
    ids.house,
    p,
  ]);
  expect(
    await run(
      ids.authAdmin,
      "select public.propose_rule_change($1,$2,'Norma','HOURS','Nuevo','',$3,1)",
      [ids.house, r, key],
    ),
  ).toBe(p);
  await expect(
    run(
      ids.authAdmin,
      "select public.propose_rule_change($1,$2,'Norma','HOURS','Texto antiguo','',$3,1)",
      [ids.house, r, randomUUID()],
    ),
  ).rejects.toThrow('cambió');
});
test('las reglas programadas se pueden consultar, pero todavía no están vigentes', async () => {
  await run(
    ids.authAdmin,
    "select public.create_rule($1,'Futura','HOURS','Más adelante',now()+interval '1 year',$2)",
    [ids.house, randomUUID()],
  );
  expect(await run(ids.authResident, 'select count(*)::int from public.current_rules')).toBe(0);
  expect(await run(ids.authResident, 'select count(*)::int from public.latest_rules')).toBe(1);
});
test('los grants explícitos del proveedor no exponen funciones internas ni futuras', async () => {
  expect(
    await scalar(
      db,
      "select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','private') and has_function_privilege('anon',p.oid,'EXECUTE')",
    ),
  ).toBe(0);
  for (const name of [
    'claim_cleanup',
    'finish_cleanup',
    'claim_membership',
    'materialize_tasks',
    'run_maintenance',
    'generate_weekly_report',
    'cleanup_attachment_reservations',
    'claim_push_deliveries',
    'finish_push_delivery',
  ]) {
    expect(
      await scalar(
        db,
        "select has_function_privilege('authenticated',p.oid,'EXECUTE') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=$1",
        [name],
      ),
    ).toBe(false);
    expect(
      await scalar(
        db,
        "select has_function_privilege('service_role',p.oid,'EXECUTE') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=$1",
        [name],
      ),
    ).toBe(true);
  }
  await db.exec(
    'create function public.temporary_acl_probe() returns integer language sql as $$ select 1 $$',
  );
  expect(
    await scalar(
      db,
      "select has_function_privilege('anon','public.temporary_acl_probe()','EXECUTE') or has_function_privilege('authenticated','public.temporary_acl_probe()','EXECUTE')",
    ),
  ).toBe(false);
  await db.exec('drop function public.temporary_acl_probe()');
});
