import { describe, expect, test } from 'vitest';
import { sql } from '../helpers/db.ts';

class Rollback extends Error {}

describe('default privileges', () => {
  test('new functions and tables in public start closed to anon and authenticated', async () => {
    let seen: Record<string, boolean> = {};
    try {
      await sql.begin(async (tx) => {
        await tx`create function public.zz_throwaway() returns int language sql as 'select 1'`;
        await tx`create table public.zz_throwaway_t (id int)`;
        const [r] = await tx`
          select
            has_function_privilege('anon', 'public.zz_throwaway()', 'execute') as anon_fn,
            has_function_privilege('authenticated', 'public.zz_throwaway()', 'execute') as auth_fn,
            has_table_privilege('anon', 'public.zz_throwaway_t', 'select') as anon_sel,
            has_table_privilege('anon', 'public.zz_throwaway_t', 'insert') as anon_ins`;
        seen = r as Record<string, boolean>;
        throw new Rollback();
      });
    } catch (e) {
      if (!(e instanceof Rollback)) throw e;
    }
    expect(seen).toEqual({ anon_fn: false, auth_fn: false, anon_sel: false, anon_ins: false });
    expect(await sql`select 1 from pg_proc where proname = 'zz_throwaway'`).toHaveLength(0);
    expect(await sql`select 1 from pg_class where relname = 'zz_throwaway_t'`).toHaveLength(0);
  });
});
