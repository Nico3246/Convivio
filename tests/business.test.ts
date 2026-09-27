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

const run = (auth: string, sql: string, params: unknown[] = []) =>
  asUser(db, auth, (tx) => scalar(tx, sql, params));
async function rule(): Promise<string> {
  return run(
    ids.authAdmin,
    `select public.create_rule($1,'Silencio','HOURS','Sin ruido evitable','2025-01-01Z',$2)`,
    [ids.house, randomUUID()],
  ) as Promise<string>;
}
async function fault(ruleId?: string): Promise<string> {
  return run(
    ids.authAdmin,
    `select public.register_fault($1,$2,$3,'2026-01-01Z','Descripción privada',$4)`,
    [ids.house, ids.resident, ruleId ?? (await rule()), randomUUID()],
  ) as Promise<string>;
}
async function debt(total = 1001, requestId = randomUUID()): Promise<string> {
  return run(
    ids.authAdmin,
    `select public.save_debt($1,'EXPENSE',$2,$3,$4,'Compra','2026-01-01',$5)`,
    [ids.house, ids.admin, ids.resident, total, requestId],
  ) as Promise<string>;
}
async function payment(
  debtId: string,
  amount: number,
  auth: string = ids.authResident,
): Promise<string> {
  return run(auth, `select public.save_payment($1,$2,$3,'2026-01-01',$4)`, [
    ids.house,
    debtId,
    amount,
    randomUUID(),
  ]) as Promise<string>;
}
async function exception(): Promise<string> {
  return run(
    ids.authAdmin,
    `select public.request_visit_exception($1,'Visita','Motivo','BOTH',now()+interval '1 day',now()+interval '2 days',$2)`,
    [ids.house, randomUUID()],
  ) as Promise<string>;
}

describe('autorización real y privacidad', () => {
  test('Google/autenticación no bastan: una identidad no autorizada no ve datos', async () => {
    expect(await run(ids.authUnknown, 'select count(*)::int from public.households')).toBe(0);
    expect(await run(ids.authUnknown, 'select count(*)::int from public.get_session()')).toBe(0);
  });
  test('un usuario de otro piso no puede actuar ni consultar faltas ajenas', async () => {
    await fault();
    expect(await run(ids.authOutsider, 'select count(*)::int from public.faults')).toBe(0);
    await expect(
      run(ids.authOutsider, `select public.create_rule($1,'X','HOURS','X',now(),$2)`, [
        ids.house,
        randomUUID(),
      ]),
    ).rejects.toThrow('Acceso no permitido');
  });
  test('el administrador no hereda el permiso de eliminar faltas del controlador', async () => {
    const f = await fault();
    await expect(
      run(ids.authAdmin, 'select public.delete_fault($1,$2,$3)', [ids.house, f, randomUUID()]),
    ).rejects.toThrow('Acceso no permitido');
  });
  test('nadie puede cambiar su rol desde el cliente; el rol es inmutable incluso ante SQL privilegiado', async () => {
    await expect(
      asUser(db, ids.authResident, (tx) => tx.exec("update public.members set role='CONTROLLER'")),
    ).rejects.toThrow();
    await expect(
      db.query("update public.members set role='RESIDENT' where id=$1", [ids.controller]),
    ).rejects.toThrow('inmutables');
  });
  test('no puede haber dos cuentas en la misma plaza', async () => {
    await expect(
      db.query(
        `insert into public.members(household_id,auth_user_id,role,display_name) values($1,$2,'RESIDENT','Otro')`,
        [ids.house, ids.authUnknown],
      ),
    ).rejects.toThrow();
  });
  test('inventarios y listas personales son invisibles al otro residente, incluido el admin', async () => {
    const item = await run(
      ids.authResident,
      "select public.add_inventory_item($1,'PERSONAL','Leche',2,'L',$2)",
      [ids.house, randomUUID()],
    );
    await run(
      ids.authResident,
      "select public.add_shopping_item($1,'PERSONAL','Arroz',1,'kg',$2)",
      [ids.house, randomUUID()],
    );
    expect(await run(ids.authAdmin, 'select count(*)::int from public.inventory_items')).toBe(0);
    expect(await run(ids.authAdmin, 'select count(*)::int from public.shopping_items')).toBe(0);
    expect(await run(ids.authResident, 'select count(*)::int from public.inventory_items')).toBe(1);
    await expect(
      run(ids.authAdmin, 'select public.set_inventory_quantity($1,$2,0,1)', [ids.house, item]),
    ).rejects.toThrow('Producto no disponible');
  });
  test('el controlador no ve economía, tareas, inventarios ni tickets', async () => {
    const d = await debt();
    await run(ids.authAdmin, "select public.add_inventory_item($1,'SHARED','Pan',1,'ud',$2)", [
      ids.house,
      randomUUID(),
    ]);
    await db.query(
      `insert into public.attachments(household_id,uploaded_by,debt_id,bucket,object_path) values($1,$2,$3,'receipts','ticket.jpg')`,
      [ids.house, ids.admin, d],
    );
    for (const table of [
      'debts',
      'debt_versions',
      'debt_balances',
      'inventory_items',
      'attachments',
    ]) {
      expect(await run(ids.authController, `select count(*)::int from public.${table}`)).toBe(0);
    }
    await expect(payment(d, 1, ids.authController)).rejects.toThrow('Acceso no permitido');
  });
  test('las tablas sensibles no aceptan escrituras directas ni siquiera del admin', async () => {
    const d = await debt();
    await expect(
      asUser(db, ids.authAdmin, (tx) => tx.query('delete from public.debts where id=$1', [d])),
    ).rejects.toThrow();
    await expect(
      asUser(db, ids.authAdmin, (tx) => tx.exec('delete from public.audit_events')),
    ).rejects.toThrow();
  });
  test('las operaciones de servicio no pueden ejecutarse desde la APK', async () => {
    await expect(run(ids.authAdmin, 'select public.claim_cleanup(20)')).rejects.toThrow();
    await expect(
      run(ids.authAdmin, 'select public.claim_membership($1,$2,$3)', [
        ids.authUnknown,
        'x@example.test',
        'X',
      ]),
    ).rejects.toThrow();
    await expect(run(ids.authAdmin, 'select public.run_maintenance()')).rejects.toThrow();
  });
  test('ninguna función de Convivio conserva EXECUTE para PUBLIC', async () => {
    const rows = await db.query<{ name: string }>(`select p.proname as name from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace
      cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
      where n.nspname in ('public','private') and acl.grantee=0 and acl.privilege_type='EXECUTE'`);
    expect(rows.rows).toEqual([]);
  });
});

describe('dinero exacto, correcciones y reintentos', () => {
  test('el deudor asume el céntimo impar', async () => {
    const d = await debt();
    expect(await scalar(db, 'select debt_cents from public.debt_balances where id=$1', [d])).toBe(
      501,
    );
  });
  test('ambos residentes pueden registrar pagos; un sobrepago se rechaza sin escritura parcial', async () => {
    const d = await debt();
    await payment(d, 100, ids.authAdmin);
    await payment(d, 200, ids.authResident);
    await expect(payment(d, 202)).rejects.toThrow('supera');
    expect(
      await scalar(db, 'select pending_cents from public.debt_balances where id=$1', [d]),
    ).toBe(201);
    expect(await scalar(db, 'select count(*)::int from public.payments')).toBe(2);
  });
  test('un reintento de gasto no crea otra deuda y rechaza reutilizar la clave con datos diferentes', async () => {
    const key = randomUUID();
    const d = await debt(1001, key);
    expect(await debt(1001, key)).toBe(d);
    await expect(debt(2001, key)).rejects.toThrow('reutilizado');
    expect(await scalar(db, 'select count(*)::int from public.debts')).toBe(1);
  });
  test('las correcciones conservan las versiones originales y calculan un único saldo vigente', async () => {
    const d = await debt(4000);
    const p = await payment(d, 1500);
    await run(
      ids.authAdmin,
      "select public.save_payment($1,$2,1000,'2026-01-01',$3,$4,1,'Importe equivocado')",
      [ids.house, d, randomUUID(), p],
    );
    expect(
      await scalar(db, 'select pending_cents from public.debt_balances where id=$1', [d]),
    ).toBe(1000);
    expect(await scalar(db, 'select count(*)::int from public.payment_versions')).toBe(2);
    expect(
      await scalar(
        db,
        'select amount_cents from public.payment_versions where payment_id=$1 and version=1',
        [p],
      ),
    ).toBe(1500);
  });
  test('una corrección obsoleta no sobrescribe una más reciente', async () => {
    const d = await debt();
    const sql =
      "select public.save_debt($1,'EXPENSE',$2,$3,1200,'Compra','2026-01-01',$4,$5,1,'Ticket corregido')";
    await run(ids.authAdmin, sql, [ids.house, ids.admin, ids.resident, randomUUID(), d]);
    await expect(
      run(ids.authResident, sql, [ids.house, ids.admin, ids.resident, randomUUID(), d]),
    ).rejects.toThrow('cambió');
  });
  test('no reduce una deuda por debajo de lo pagado; el motivo de corrección es obligatorio', async () => {
    const d = await debt();
    await payment(d, 400);
    await expect(
      run(
        ids.authAdmin,
        "select public.save_debt($1,'EXPENSE',$2,$3,600,'Compra','2026-01-01',$4,$5,1,'Ticket')",
        [ids.house, ids.admin, ids.resident, randomUUID(), d],
      ),
    ).rejects.toThrow('Corrige primero');
    await expect(
      run(
        ids.authAdmin,
        "select public.save_debt($1,'EXPENSE',$2,$3,1200,'Compra','2026-01-01',$4,$5,1,null)",
        [ids.house, ids.admin, ids.resident, randomUUID(), d],
      ),
    ).rejects.toThrow();
  });
  test('permite anular un pago erróneo manteniendo el original', async () => {
    const d = await debt();
    const p = await payment(d, 501);
    await run(
      ids.authResident,
      "select public.save_payment($1,$2,0,'2026-01-01',$3,$4,1,'No se hizo este pago')",
      [ids.house, d, randomUUID(), p],
    );
    expect(
      await scalar(db, 'select pending_cents from public.debt_balances where id=$1', [d]),
    ).toBe(501);
    expect(
      await scalar(db, 'select count(*)::int from public.payment_versions where payment_id=$1', [
        p,
      ]),
    ).toBe(2);
  });
});

describe('convivencia e informes', () => {
  test('una falta queda vinculada a la versión vigente cuando sucedió', async () => {
    const r = await rule();
    const p = await run(
      ids.authAdmin,
      "select public.propose_rule_change($1,$2,'Nuevo título','HOURS','Nuevo texto','Motivo',$3,1)",
      [ids.house, r, randomUUID()],
    );
    await run(ids.authController, "select public.decide_rule_change($1,$2,'APPROVED')", [
      ids.house,
      p,
    ]);
    const f = await fault(r);
    expect(
      await scalar(
        db,
        'select v.version from public.faults f join public.rule_versions v on v.id=f.rule_version_id where f.id=$1',
        [f],
      ),
    ).toBe(1);
  });
  test('un residente puede ponerse una falta a sí mismo, pero el controlador no puede registrarla ni comentarla', async () => {
    const r = await rule();
    const sql = "select public.register_fault($1,$2,$3,'2026-01-01Z','Autodeclarada',$4)";
    const f = await run(ids.authResident, sql, [ids.house, ids.resident, r, randomUUID()]);
    await expect(
      run(ids.authController, sql, [ids.house, ids.resident, r, randomUUID()]),
    ).rejects.toThrow('Acceso no permitido');
    await expect(
      run(ids.authController, "select public.comment_fault($1,$2,'Comentario',$3)", [
        ids.house,
        f,
        randomUUID(),
      ]),
    ).rejects.toThrow('Acceso no permitido');
    expect(await scalar(db, 'select count(*)::int from public.notifications')).toBe(0);
  });
  test('dos aprobaciones distintas autorizan la visita y solo se notifica el resultado final', async () => {
    const e = await exception();
    await expect(
      run(ids.authAdmin, "select public.decide_visit_exception($1,$2,'APPROVED')", [ids.house, e]),
    ).rejects.toThrow('No puedes');
    expect(
      await run(ids.authResident, "select public.decide_visit_exception($1,$2,'APPROVED')", [
        ids.house,
        e,
      ]),
    ).toBe('PENDING');
    expect(
      await run(ids.authController, "select public.decide_visit_exception($1,$2,'APPROVED')", [
        ids.house,
        e,
      ]),
    ).toBe('APPROVED');
    expect(
      await scalar(
        db,
        "select count(*)::int from public.notifications where kind='EXCEPTION_APPROVED'",
      ),
    ).toBe(1);
    await run(ids.authController, "select public.decide_visit_exception($1,$2,'APPROVED')", [
      ids.house,
      e,
    ]);
    expect(await scalar(db, 'select count(*)::int from public.notifications')).toBe(3);
  });
  test('un rechazo es definitivo y no espera la segunda respuesta', async () => {
    const e = await exception();
    expect(
      await run(ids.authController, "select public.decide_visit_exception($1,$2,'REJECTED')", [
        ids.house,
        e,
      ]),
    ).toBe('REJECTED');
    await expect(
      run(ids.authResident, "select public.decide_visit_exception($1,$2,'APPROVED')", [
        ids.house,
        e,
      ]),
    ).rejects.toThrow('ya no admite');
  });
  test('el informe incluye un registro tardío por fecha de registro, sin duplicarlo al reintentar', async () => {
    const f = await fault();
    await db.query("update public.faults set registered_at='2026-01-05Z' where id=$1", [f]);
    const r = await scalar<string>(
      db,
      "select public.generate_weekly_report($1,'2026-01-10 11:00Z')",
      [ids.house],
    );
    expect(
      await scalar(
        db,
        'select count(*)::int from public.report_entries where report_id=$1 and fault_id=$2',
        [r, f],
      ),
    ).toBe(1);
    expect(
      await scalar(db, "select public.generate_weekly_report($1,'2026-01-10 11:00Z')", [ids.house]),
    ).toBe(r);
    expect(await scalar(db, 'select count(*)::int from public.notifications')).toBe(3);
  });
  test('los periodos semanales respetan ambos cambios de hora de Madrid', async () => {
    const spring = await scalar<string>(
      db,
      "select public.generate_weekly_report($1,'2025-04-05 10:00Z')",
      [ids.house],
    );
    const autumn = await scalar<string>(
      db,
      "select public.generate_weekly_report($1,'2025-11-01 11:00Z')",
      [ids.house],
    );
    expect(
      await scalar(
        db,
        'select extract(epoch from ends_at-starts_at)::int/3600 from public.weekly_reports where id=$1',
        [spring],
      ),
    ).toBe(167);
    expect(
      await scalar(
        db,
        'select extract(epoch from ends_at-starts_at)::int/3600 from public.weekly_reports where id=$1',
        [autumn],
      ),
    ).toBe(169);
  });
  test('los informes tampoco filtran dinero al controlador', async () => {
    await debt();
    await db.exec("update public.debt_versions set created_at='2026-01-05Z'");
    await scalar(db, "select public.generate_weekly_report($1,'2026-01-10 11:00Z')", [ids.house]);
    expect(await run(ids.authController, 'select count(*)::int from public.report_entries')).toBe(
      0,
    );
    expect(await run(ids.authResident, 'select count(*)::int from public.report_entries')).toBe(1);
  });
});

describe('borrados definitivos', () => {
  test('eliminar una falta retira contenido, comentarios y adjuntos y deja solo una anotación en el informe', async () => {
    const f = await fault();
    await run(ids.authResident, "select public.comment_fault($1,$2,'Detalle privado',$3)", [
      ids.house,
      f,
      randomUUID(),
    ]);
    await db.query("update public.faults set registered_at='2026-01-05Z' where id=$1", [f]);
    const r = await scalar<string>(
      db,
      "select public.generate_weekly_report($1,'2026-01-10 11:00Z')",
      [ids.house],
    );
    await db.query(
      `insert into public.attachments(household_id,uploaded_by,fault_id,bucket,object_path) values($1,$2,$3,'fault-evidence','prueba.jpg')`,
      [ids.house, ids.admin, f],
    );
    await db.exec(
      "insert into storage.objects(bucket_id,name) values('fault-evidence','prueba.jpg')",
    );
    expect(await run(ids.authResident, 'select count(*)::int from storage.objects')).toBe(1);
    await run(ids.authController, 'select public.delete_fault($1,$2,$3)', [
      ids.house,
      f,
      randomUUID(),
    ]);
    for (const t of ['faults', 'fault_comments', 'attachments'])
      expect(await scalar(db, `select count(*)::int from public.${t}`)).toBe(0);
    expect(await run(ids.authResident, 'select count(*)::int from storage.objects')).toBe(0);
    expect(
      await scalar(
        db,
        'select count(*)::int from public.report_entries where report_id=$1 and deletion_event_id is not null',
        [r],
      ),
    ).toBe(1);
    expect(
      await scalar(db, "select count(*)::int from private.cleanup_queue where kind='STORAGE'"),
    ).toBe(1);
  });
  test('baja de residente borra también gastos compartidos, pagos, faltas, privados y referencias del informe', async () => {
    const d = await debt();
    await payment(d, 100);
    const f = await fault();
    await run(
      ids.authResident,
      "select public.add_inventory_item($1,'PERSONAL','Producto',1,'ud',$2)",
      [ids.house, randomUUID()],
    );
    await db.exec(
      "update public.debt_versions set created_at='2026-01-05Z'; update public.faults set registered_at='2026-01-05Z'",
    );
    await scalar(db, "select public.generate_weekly_report($1,'2026-01-10 11:00Z')", [ids.house]);
    await run(ids.authAdmin, "select public.delete_account($1,$2,'ELIMINAR CUENTA')", [
      ids.house,
      ids.resident,
    ]);
    for (const t of [
      'debts',
      'debt_versions',
      'payments',
      'payment_versions',
      'faults',
      'inventory_items',
      'report_entries',
    ])
      expect(await scalar(db, `select count(*)::int from public.${t}`)).toBe(0);
    expect(await run(ids.authResident, 'select count(*)::int from public.households')).toBe(0);
    expect(
      await scalar(db, 'select count(*)::int from private.command_receipts where result_id=$1', [
        f,
      ]),
    ).toBe(0);
    expect(
      await scalar(db, 'select count(*)::int from public.households where id=$1', [ids.house]),
    ).toBe(1);
  });
  test('la plaza liberada admite una nueva cuenta con el mismo rol e historial nuevo', async () => {
    await run(ids.authAdmin, "select public.delete_account($1,$2,'ELIMINAR CUENTA')", [
      ids.house,
      ids.resident,
    ]);
    await run(
      ids.authAdmin,
      "select public.invite_replacement($1,'nuevo@example.test','RESIDENT')",
      [ids.house],
    );
    const id = await scalar<string>(
      db,
      "select public.claim_membership($1,'nuevo@example.test','Nuevo residente')",
      [ids.authUnknown],
    );
    expect(id).not.toBe(ids.resident);
    expect(await scalar(db, 'select role from public.members where id=$1', [id])).toBe('RESIDENT');
  });
  test('la baja del administrador elimina el piso y encola las tres identidades; otro piso permanece', async () => {
    await debt();
    await fault();
    await expect(
      run(ids.authAdmin, "select public.delete_account($1,$2,'ELIMINAR CUENTA')", [
        ids.house,
        ids.admin,
      ]),
    ).rejects.toThrow('Confirmación');
    await run(ids.authAdmin, "select public.delete_account($1,$2,'ELIMINAR PISO')", [
      ids.house,
      ids.admin,
    ]);
    expect(
      await scalar(db, 'select count(*)::int from public.households where id=$1', [ids.house]),
    ).toBe(0);
    expect(
      await scalar(db, 'select count(*)::int from public.members where household_id=$1', [
        ids.house,
      ]),
    ).toBe(0);
    expect(
      await scalar(db, 'select count(*)::int from public.households where id=$1', [ids.otherHouse]),
    ).toBe(1);
    expect(
      await scalar(db, "select count(*)::int from private.cleanup_queue where kind='AUTH'"),
    ).toBe(3);
  });
  test('borrar al controlador borra las normas que aprobó, evitando reactivar versiones antiguas', async () => {
    const r = await rule();
    const p = await run(
      ids.authAdmin,
      "select public.propose_rule_change($1,$2,'Nueva','HOURS','Texto','Motivo',$3,1)",
      [ids.house, r, randomUUID()],
    );
    await run(ids.authController, "select public.decide_rule_change($1,$2,'APPROVED')", [
      ids.house,
      p,
    ]);
    await run(ids.authAdmin, "select public.delete_account($1,$2,'ELIMINAR CUENTA')", [
      ids.house,
      ids.controller,
    ]);
    expect(await scalar(db, 'select count(*)::int from public.rules where id=$1', [r])).toBe(0);
    expect(
      await scalar(db, 'select count(*)::int from public.rule_versions where rule_id=$1', [r]),
    ).toBe(0);
  });
});

describe('calendario', () => {
  test('una tarea pendiente no desplaza ni reasigna el siguiente turno', async () => {
    const template = await run(
      ids.authAdmin,
      "select public.create_task_template($1,'Basura','','Cocina','GARBAGE',$2,current_date,7,null,true,$3)",
      [ids.house, ids.admin, randomUUID()],
    );
    await scalar(db, 'select public.materialize_tasks($1,current_date+14)', [ids.house]);
    const rows = (
      await db.query<{ assigned_to: string; completed_at: null }>(
        'select assigned_to,completed_at from public.task_occurrences where template_id=$1 order by due_date',
        [template],
      )
    ).rows;
    expect(rows.map((r) => r.assigned_to)).toEqual([ids.admin, ids.resident, ids.admin]);
    expect(rows[0]?.completed_at).toBeNull();
    expect(
      await scalar(db, 'select public.materialize_tasks($1,current_date+14)', [ids.house]),
    ).toBe(0);
  });
  test('solo el responsable puede completar su tarea', async () => {
    await run(
      ids.authAdmin,
      "select public.create_task_template($1,'Baño','','Baño','CLEANING',$2,current_date,7,null,false,$3)",
      [ids.house, ids.resident, randomUUID()],
    );
    await scalar(db, 'select public.materialize_tasks($1,current_date)', [ids.house]);
    const task = await scalar<string>(db, 'select id from public.task_occurrences');
    await expect(
      run(ids.authAdmin, 'select public.complete_task($1,$2)', [ids.house, task]),
    ).rejects.toThrow('responsable');
    await run(ids.authResident, 'select public.complete_task($1,$2)', [ids.house, task]);
    expect(
      await scalar(db, 'select completed_by from public.task_occurrences where id=$1', [task]),
    ).toBe(ids.resident);
  });
  test('rechaza turnos de ducha solapados, pero admite intervalos consecutivos', async () => {
    await run(ids.authAdmin, "select public.create_shower_slot($1,$2,1,'20:00','20:20',$3)", [
      ids.house,
      ids.admin,
      randomUUID(),
    ]);
    await expect(
      run(ids.authAdmin, "select public.create_shower_slot($1,$2,1,'20:10','20:30',$3)", [
        ids.house,
        ids.resident,
        randomUUID(),
      ]),
    ).rejects.toThrow('solapa');
    await run(ids.authAdmin, "select public.create_shower_slot($1,$2,1,'20:20','20:40',$3)", [
      ids.house,
      ids.resident,
      randomUUID(),
    ]);
    expect(await scalar(db, 'select count(*)::int from public.shower_slots')).toBe(2);
  });
});
