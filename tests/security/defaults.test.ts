import { describe, expect, test } from 'vitest';
import { sql } from '../helpers/db.ts';

class Rollback extends Error {}

describe('default privileges', () => {
  test('new functions, tables and sequences in public start closed to anon and authenticated', async () => {
    let seen: Record<string, boolean> = {};
    try {
      await sql.begin(async (tx) => {
        await tx`create function public.zz_throwaway() returns int language sql as 'select 1'`;
        await tx`create table public.zz_throwaway_t (id int)`;
        await tx`create sequence public.zz_throwaway_s`;
        const [r] = await tx`
          select
            has_function_privilege('anon', 'public.zz_throwaway()', 'execute') as anon_fn,
            has_function_privilege('authenticated', 'public.zz_throwaway()', 'execute') as auth_fn,
            has_table_privilege('anon', 'public.zz_throwaway_t', 'select') as anon_sel,
            has_table_privilege('anon', 'public.zz_throwaway_t', 'insert') as anon_ins,
            has_table_privilege('authenticated', 'public.zz_throwaway_t', 'select') as auth_sel,
            has_table_privilege('authenticated', 'public.zz_throwaway_t', 'insert') as auth_ins,
            has_table_privilege('authenticated', 'public.zz_throwaway_t', 'truncate') as auth_trunc,
            has_sequence_privilege('anon', 'public.zz_throwaway_s', 'usage') as anon_seq,
            has_sequence_privilege('authenticated', 'public.zz_throwaway_s', 'usage') as auth_seq,
            has_sequence_privilege('authenticated', 'public.zz_throwaway_s', 'update') as auth_seq_upd`;
        seen = r as Record<string, boolean>;
        throw new Rollback();
      });
    } catch (e) {
      if (!(e instanceof Rollback)) throw e;
    }
    expect(seen).toEqual({
      anon_fn: false, auth_fn: false, anon_sel: false, anon_ins: false,
      auth_sel: false, auth_ins: false, auth_trunc: false,
      anon_seq: false, auth_seq: false, auth_seq_upd: false,
    });
    expect(await sql`select 1 from pg_proc where proname = 'zz_throwaway'`).toHaveLength(0);
    expect(await sql`select 1 from pg_class where relname in ('zz_throwaway_t', 'zz_throwaway_s')`).toHaveLength(0);
  });
});
