import { PGlite, type Transaction } from '@electric-sql/pglite';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const ids = {
  house: '10000000-0000-4000-8000-000000000001',
  otherHouse: '10000000-0000-4000-8000-000000000002',
  admin: '20000000-0000-4000-8000-000000000001',
  resident: '20000000-0000-4000-8000-000000000002',
  controller: '20000000-0000-4000-8000-000000000003',
  outsider: '20000000-0000-4000-8000-000000000004',
  authAdmin: '30000000-0000-4000-8000-000000000001',
  authResident: '30000000-0000-4000-8000-000000000002',
  authController: '30000000-0000-4000-8000-000000000003',
  authOutsider: '30000000-0000-4000-8000-000000000004',
  authUnknown: '30000000-0000-4000-8000-000000000005',
} as const;

export async function database(): Promise<PGlite> {
  const db = new PGlite();
  // Only Supabase's surrounding Auth/Storage schemas are simulated. The exact
  // unmodified production migrations, PL/pgSQL, roles and RLS run on PostgreSQL.
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated, service_role;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets,name text,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated,service_role;
    grant select,insert,update,delete on storage.objects to authenticated;
    -- Reproduce permissive provider defaults, including explicit grants that
    -- survive a REVOKE FROM PUBLIC. Final migrations must close them as well.
    create schema private;
    alter default privileges grant execute on functions to anon,authenticated,service_role;
    alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;
    alter default privileges in schema private grant execute on functions to anon,authenticated,service_role;
    alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
  `);
  const dir = resolve('supabase/migrations');
  for (const file of (await readdir(dir)).filter((p) => p.endsWith('.sql')).sort()) {
    try {
      await db.exec(await readFile(resolve(dir, file), 'utf8'));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error SQL';
      await db.close();
      throw new Error(`${file}: ${message}`);
    }
  }
  return db;
}

export async function seed(db: PGlite): Promise<void> {
  await db.exec(`
    insert into auth.users(id) values
      ('${ids.authAdmin}'),('${ids.authResident}'),('${ids.authController}'),('${ids.authOutsider}'),('${ids.authUnknown}');
    insert into public.households(id,name,created_at) values
      ('${ids.house}','Piso de prueba','2025-01-01Z'),('${ids.otherHouse}','Otro piso','2025-01-01Z');
    insert into public.members(id,household_id,auth_user_id,role,display_name) values
      ('${ids.admin}','${ids.house}','${ids.authAdmin}','ADMIN','Alex'),
      ('${ids.resident}','${ids.house}','${ids.authResident}','RESIDENT','Dani'),
      ('${ids.controller}','${ids.house}','${ids.authController}','CONTROLLER','Controlador'),
      ('${ids.outsider}','${ids.otherHouse}','${ids.authOutsider}','ADMIN','Otra persona');
  `);
}

export function asUser<T>(
  db: PGlite,
  authId: string,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec('set local role authenticated');
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [authId]);
    return fn(tx);
  });
}

export async function scalar<T>(
  db: Pick<PGlite, 'query'> | Transaction,
  sql: string,
  params: unknown[] = [],
): Promise<T> {
  const result = await db.query<Record<string, T>>(sql, params);
  const row = result.rows[0];
  if (!row) throw new Error('La consulta no devolvió ningún resultado');
  const value = Object.values(row)[0];
  if (value === undefined) throw new Error('La consulta no devolvió ningún valor');
  return value;
}
