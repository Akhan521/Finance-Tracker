import { describe, expect, test } from 'vitest';
import { anonClient, sql } from '../helpers/db.ts';

class Rollback extends Error {}

type Q = typeof sql;

/** Run `fn` inside a transaction that is always rolled back. */
async function inThrowaway<T>(fn: (tx: Q) => Promise<T>): Promise<T> {
  let out!: T;
  try {
    await sql.begin(async (tx) => {
      out = await fn(tx as unknown as Q);
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
  return out;
}

const names = (rows: readonly { name: string }[]) => rows.map((r) => r.name).sort();

// Catalog queries. Each takes the connection so a test can also run it in a
// rolled-back transaction that contains a deliberate violation.
const tablesWithoutRls = async (q: Q) =>
  names(await q`
    select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity`);

const viewsNotInvoker = async (q: Q) =>
  names(await q`
    select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('v', 'm')
      and not exists (select 1 from unnest(coalesce(c.reloptions, '{}')) o
                      where lower(o) ~ '^security_invoker=(t|tr|tru|true|y|ye|yes|on|1)$')`);

const definersWithoutSearchPath = async (q: Q) =>
  names(await q`
    select p.oid::regprocedure::text as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%')`);

// Ordinary functions of public (not owned by an extension).
const fnFilter = `n.nspname = 'public' and not exists (
  select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')`;

// Full signatures (regprocedure), so overloads are never collapsed.
const fnsExecutableBy = async (q: Q, role: string) =>
  names(await q.unsafe(
    `select p.oid::regprocedure::text as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where ${fnFilter} and has_function_privilege($1, p.oid, 'execute')`,
    [role],
  ));

const fnsWithPublicExecute = async (q: Q) =>
  names(await q.unsafe(
    `select p.oid::regprocedure::text as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where ${fnFilter}
       and exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                   where a.grantee = 0 and a.privilege_type = 'EXECUTE')`,
  ));

const definersNotOwnedByPostgres = async (q: Q) =>
  names(await q`
    select p.oid::regprocedure::text as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef and pg_get_userbyid(p.proowner) <> 'postgres'`);

const relationsInPublic = async (q: Q) =>
  names(await q`
    select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p') order by 1`);

// Table-level privileges, plus column-level ones (has_table_privilege is false
// for a column-only grant, has_any_column_privilege is true). Uses oids, so no
// name quoting is involved.
const anonTablePrivs = async (q: Q) => {
  const rows = await q`
    select c.relname as rel, p.priv, 'table' as lvl
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      cross join unnest(array['select','insert','update','delete','truncate','references','trigger']) as p(priv)
     where n.nspname = 'public' and c.relkind in ('r','v','m','p')
       and has_table_privilege('anon', c.oid, p.priv)
    union all
    select c.relname, p.priv, 'column'
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      cross join unnest(array['select','insert','update','references']) as p(priv)
     where n.nspname = 'public' and c.relkind in ('r','v','m','p')
       and has_any_column_privilege('anon', c.oid, p.priv)`;
  return rows.map((r) => `${r.rel}:${r.priv}${r.lvl === 'column' ? ':column' : ''}`).sort();
};

const anonSequencePrivs = async (q: Q) => {
  const rows = await q`
    select c.relname as rel, p.priv
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      cross join unnest(array['usage','select','update']) as p(priv)
     where n.nspname = 'public' and c.relkind = 'S' and has_sequence_privilege('anon', c.oid, p.priv)`;
  return rows.map((r) => `${r.rel}:${r.priv}`).sort();
};

// Default privileges that would hand anon future objects: any pg_default_acl
// entry for public (or global) where anon is a grantee, for roles that create
// objects in public (postgres plus every current owner there).
const anonDefaultAcls = async (q: Q) =>
  names(await q`
    with owners as (
      select 'postgres'::name as r
      union select pg_get_userbyid(relowner) from pg_class where relnamespace = 'public'::regnamespace
      union select pg_get_userbyid(proowner) from pg_proc where pronamespace = 'public'::regnamespace
    )
    select pg_get_userbyid(d.defaclrole) || ':' || d.defaclobjtype::text as name
      from pg_default_acl d
     where (d.defaclnamespace = 0 or d.defaclnamespace = 'public'::regnamespace)
       and pg_get_userbyid(d.defaclrole) in (select r from owners)
       and exists (select 1 from aclexplode(d.defaclacl) a
                   where a.grantee = (select oid from pg_roles where rolname = 'anon'))`);

// Exact signatures as printed by regprocedure. A new overload fails the test.
const AUTHENTICATED_FUNCTIONS = [
  'is_member(uuid)', 'is_owner(uuid)', 'my_household_id()', 'can_access_bill(uuid)',
  'create_household(text,text)', 'household_names()', 'my_invites()', 'accept_invite(uuid)',
  'delete_household(uuid)', 'account_deletion_blocker()', 'scope_today(uuid,uuid)',
  'status_rule(boolean,bigint,bigint,date,date)',
];
// Task 23 adds health_check(p_token text): its signature goes here then.
const ANON_FUNCTIONS: string[] = [];
const ANON_FUNCTION_NAMES = ['health_check'];

function diff(actual: string[], allowed: string[]) {
  return {
    extra: actual.filter((x) => !allowed.includes(x)),
    missing: allowed.filter((x) => !actual.includes(x)),
  };
}

// anon may run health_check only (any signature Task 23 gives it), nothing else.
function anonDiff(actual: string[]) {
  return {
    extra: actual.filter((x) => !ANON_FUNCTION_NAMES.includes(x.replace(/\(.*$/, '')) && !ANON_FUNCTIONS.includes(x)),
  };
}

describe('whole-schema security sweep (public)', () => {
  test('every table in public has row-level security enabled', async () => {
    expect(await tablesWithoutRls(sql)).toEqual([]);
  });

  test('the RLS check bites: a table without RLS is flagged', async () => {
    const flagged = await inThrowaway(async (tx) => {
      await tx`create table public.zz_no_rls (id int)`;
      return tablesWithoutRls(tx);
    });
    expect(flagged).toEqual(['zz_no_rls']);
  });

  test('every view in public is security_invoker', async () => {
    expect(await viewsNotInvoker(sql)).toEqual([]);
  });

  test('the view check bites: a plain view is flagged', async () => {
    const flagged = await inThrowaway(async (tx) => {
      await tx`create view public.zz_plain_view as select 1 as x`;
      return viewsNotInvoker(tx);
    });
    expect(flagged).toEqual(['zz_plain_view']);
  });

  test('the view check accepts security_invoker=on', async () => {
    const flagged = await inThrowaway(async (tx) => {
      await tx`create view public.zz_on_view with (security_invoker = on) as select 1 as x`;
      return viewsNotInvoker(tx);
    });
    expect(flagged).toEqual([]);
  });

  test('every security definer function pins search_path', async () => {
    expect(await definersWithoutSearchPath(sql)).toEqual([]);
  });

  test('the search_path check bites: a definer function without it is flagged', async () => {
    const flagged = await inThrowaway(async (tx) => {
      await tx`create function public.zz_definer() returns int language sql security definer as 'select 1'`;
      return definersWithoutSearchPath(tx);
    });
    expect(flagged).toEqual(['zz_definer()']);
  });

  test('no function in public has a PUBLIC execute grant', async () => {
    expect(await fnsWithPublicExecute(sql)).toEqual([]);
  });

  test('the PUBLIC execute check bites', async () => {
    const flagged = await inThrowaway(async (tx) => {
      await tx`create function public.zz_open() returns int language sql as 'select 1'`;
      await tx`grant execute on function public.zz_open() to public`;
      return fnsWithPublicExecute(tx);
    });
    expect(flagged).toEqual(['zz_open()']);
  });

  test('anon can execute only health_check in public', async () => {
    const d = anonDiff(await fnsExecutableBy(sql, 'anon'));
    expect(d.extra, `anon can execute unexpected functions: ${d.extra.join(', ')}`).toEqual([]);
  });

  test('the anon function check bites: a function granted to anon is flagged', async () => {
    const found = await inThrowaway(async (tx) => {
      await tx`create function public.zz_anon() returns int language sql as 'select 1'`;
      await tx`grant execute on function public.zz_anon() to anon`;
      return fnsExecutableBy(tx, 'anon');
    });
    expect(anonDiff(found).extra).toEqual(['zz_anon()']);
  });

  test('authenticated can execute exactly the allow-listed functions in public', async () => {
    const d = diff(await fnsExecutableBy(sql, 'authenticated'), AUTHENTICATED_FUNCTIONS);
    expect(
      d,
      `authenticated function drift. extra: [${d.extra.join(', ')}] missing: [${d.missing.join(', ')}]`,
    ).toEqual({ extra: [], missing: [] });
  });

  test('the authenticated allow-list check bites: an extra grant is reported as extra', async () => {
    const found = await inThrowaway(async (tx) => {
      await tx`create function public.zz_auth() returns int language sql as 'select 1'`;
      await tx`grant execute on function public.zz_auth() to authenticated`;
      return fnsExecutableBy(tx, 'authenticated');
    });
    expect(diff(found, AUTHENTICATED_FUNCTIONS)).toEqual({ extra: ['zz_auth()'], missing: [] });
  });

  test('the allow-list bites on a new overload of an allow-listed name', async () => {
    const found = await inThrowaway(async (tx) => {
      await tx`create function public.is_member(int) returns boolean language sql as 'select true'`;
      await tx`grant execute on function public.is_member(int) to authenticated`;
      return fnsExecutableBy(tx, 'authenticated');
    });
    expect(diff(found, AUTHENTICATED_FUNCTIONS)).toEqual({ extra: ['is_member(integer)'], missing: [] });
  });

  test('anon has no table privileges in public', async () => {
    expect(await anonTablePrivs(sql)).toEqual([]);
  });

  test('the anon table check bites: a granted table is flagged', async () => {
    const found = await inThrowaway(async (tx) => {
      await tx`create table public.zz_anon_t (id int)`;
      await tx`grant select on public.zz_anon_t to anon`;
      return anonTablePrivs(tx);
    });
    expect(found).toEqual(['zz_anon_t:select', 'zz_anon_t:select:column']);
  });

  test('the anon table check bites on a column-level grant only', async () => {
    const found = await inThrowaway(async (tx) => {
      await tx`create table public.zz_anon_c (id int, secret int)`;
      await tx`grant select (secret) on public.zz_anon_c to anon`;
      await tx`grant update (secret) on public.zz_anon_c to anon`;
      const [t] = await tx`select has_table_privilege('anon', 'public.zz_anon_c', 'select') as ok`;
      expect(t!.ok).toBe(false); // the table-level check alone would miss it
      return anonTablePrivs(tx);
    });
    expect(found).toEqual(['zz_anon_c:select:column', 'zz_anon_c:update:column']);
  });

  test('anon has no privileges on any sequence in public', async () => {
    expect(await anonSequencePrivs(sql)).toEqual([]);
  });

  test('the sequence check bites', async () => {
    const found = await inThrowaway(async (tx) => {
      await tx`create sequence public.zz_seq`;
      await tx`grant usage on sequence public.zz_seq to anon`;
      return anonSequencePrivs(tx);
    });
    expect(found).toEqual(['zz_seq:usage']);
  });

  test('every security definer function in public is owned by postgres', async () => {
    expect(await definersNotOwnedByPostgres(sql)).toEqual([]);
  });

  test('the owner check bites: a definer owned by another role is flagged', async () => {
    const flagged = await inThrowaway(async (tx) => {
      await tx`create function public.zz_owned() returns int language sql security definer set search_path = '' as 'select 1'`;
      await tx`create role zz_other_owner`;
      await tx`grant zz_other_owner to postgres`;
      await tx`grant create on schema public to zz_other_owner`;
      await tx`alter function public.zz_owned() owner to zz_other_owner`;
      return definersNotOwnedByPostgres(tx);
    });
    expect(flagged).toEqual(['zz_owned()']);
  });

  test('default privileges in public grant anon nothing on future objects', async () => {
    expect(await anonDefaultAcls(sql)).toEqual([]);
  });

  test('the default-privileges check bites', async () => {
    const flagged = await inThrowaway(async (tx) => {
      await tx`alter default privileges for role postgres in schema public grant select on tables to anon`;
      await tx`alter default privileges for role postgres in schema public grant execute on functions to anon`;
      await tx`alter default privileges for role postgres in schema public grant usage on sequences to anon`;
      return anonDefaultAcls(tx);
    });
    expect(flagged).toEqual(['postgres:S', 'postgres:f', 'postgres:r']);
  });

  test('signed out, the API returns nothing from any table or view', async () => {
    const rels = await relationsInPublic(sql);
    // Not vacuous: the known tables and the view are all in the list.
    expect(rels.length).toBeGreaterThanOrEqual(11);
    expect(rels).toEqual(expect.arrayContaining(['profiles', 'bills', 'entries', 'entry_view']));
    for (const rel of rels) {
      const { data, error } = await anonClient()
        .from(rel as never)
        .select('*');
      expect(data ?? [], `${rel} returned rows to anon`).toEqual([]);
      expect(error, `${rel} should be refused for anon`).not.toBeNull();
      expect(error!.code, `${rel}: ${error!.message}`).toBe('42501');
    }
  });
});
