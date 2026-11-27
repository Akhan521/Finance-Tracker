import { describe, expect, test } from 'vitest';
import { errorMessage } from './errors';

// Every key the migrations raise. Read from the SQL so a new key without copy fails.
const migrations = import.meta.glob('../../supabase/migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const raised = new Set<string>();
for (const sql of Object.values(migrations)) {
  for (const m of sql.matchAll(/raise\s+exception\s+'([a-z_]+)'/gi)) raised.add(m[1]);
}

const EXTRA = ['could_not_delete', 'unauthorized', 'no_access', 'bad_email', 'email_failed', 'invite_failed', 'forbidden', 'already_invited', 'too_many_invites'];
const GENERIC = 'Something went wrong. Please try again.';

describe('errorMessage', () => {
  test('finds the keys raised in the migrations', () => {
    expect(raised.size).toBeGreaterThanOrEqual(14);
    expect(raised.has('last_owner')).toBe(true);
  });

  test.each([...raised].sort())('has its own copy for migration key %s', (key) => {
    const text = errorMessage({ message: key });
    expect(text).toBeTruthy();
    expect(text).not.toBe(GENERIC);
    expect(text).not.toContain(key);
  });

  test.each(EXTRA)('has its own copy for %s', (key) => {
    expect(errorMessage({ message: key })).not.toBe(GENERIC);
  });

  test('last_owner reads as calm guidance', () => {
    expect(errorMessage({ message: 'last_owner' })).toBe('Make someone else an owner first.');
  });

  test('works with Error objects', () => {
    expect(errorMessage(new Error('forbidden'))).not.toBe(GENERIC);
  });

  test.each([
    [{ message: 'duplicate key value violates unique constraint "x"' }],
    [new Error('fetch failed')],
    ['nope'],
    [null],
    [undefined],
    [{}],
  ])('unknown errors get the generic line and never raw text (%#)', (e) => {
    expect(errorMessage(e)).toBe(GENERIC);
  });
});
