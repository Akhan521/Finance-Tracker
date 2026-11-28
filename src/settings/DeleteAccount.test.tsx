import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const m = vi.hoisted(() => ({
  rpc: vi.fn(),
  invoke: vi.fn(),
  signOut: vi.fn(),
  exportRun: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: { rpc: m.rpc, functions: { invoke: m.invoke }, auth: { signOut: m.signOut } },
}));
vi.mock('./useCsvExport', () => ({
  useCsvExport: () => ({ exporting: false, error: '', ready: true, run: m.exportRun }),
}));

import DeleteAccount from './DeleteAccount';

const SIGN_IN = 'Please sign in again.';
const GENERIC = "We couldn't delete your account. Please try again.";

let qc: QueryClient;
let user: ReturnType<typeof userEvent.setup>;

function wrap() {
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <DeleteAccount userId="u1" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const httpError = (status: number, body: unknown) =>
  new FunctionsHttpError(new Response(JSON.stringify(body), { status }));

async function ready() {
  wrap();
  return screen.findByLabelText('Type DELETE to confirm');
}

beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  m.rpc.mockReset().mockResolvedValue({ data: null, error: null });
  m.invoke.mockReset().mockResolvedValue({ data: null, error: null });
  m.signOut.mockReset().mockResolvedValue({ error: null });
  m.exportRun.mockReset();
  sessionStorage.clear();
  user = userEvent.setup();
});

afterEach(cleanup);

describe('DeleteAccount', () => {
  test('shows the warning, the backup note and the export button first', async () => {
    await ready();
    expect(screen.getByText(/Deleting your account is permanent\./)).toBeTruthy();
    expect(screen.getByText(/Former member/)).toBeTruthy();
    expect(screen.getByText('Backups may keep deleted data for a short while before it ages out.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Export your data first' }));
    expect(m.exportRun).toHaveBeenCalledTimes(1);
    expect(m.rpc).toHaveBeenCalledWith('account_deletion_blocker');
  });

  test('has the top bar link back to Settings and the page title', async () => {
    await ready();
    expect(screen.getByRole('link', { name: '‹ Settings' }).getAttribute('href')).toBe('/settings');
    expect(screen.getByRole('heading', { name: 'Delete account' })).toBeTruthy();
  });

  test('shows a calm placeholder while the blocker loads, with no confirm controls', () => {
    m.rpc.mockReturnValue(new Promise(() => {}));
    wrap();
    expect(screen.getByRole('status').textContent).toContain('Loading');
    expect(screen.queryByLabelText('Type DELETE to confirm')).toBeNull();
  });

  test('the visible label is the field accessible name, with no placeholder', async () => {
    const field = await ready();
    expect(field.getAttribute('placeholder')).toBeNull();
    expect(screen.getByText('Type DELETE to confirm')).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Type DELETE to confirm' })).toBe(field);
  });

  test('Delete stays disabled until exactly DELETE is typed (trimmed, case-sensitive)', async () => {
    const field = await ready();
    const button = screen.getByRole('button', { name: 'Delete my account' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await user.type(field, 'delete');
    expect(button.disabled).toBe(true);
    await user.clear(field);
    await user.type(field, 'DELETE');
    expect(button.disabled).toBe(false);
    await user.clear(field);
    await user.type(field, 'DELETE ');
    expect(button.disabled).toBe(false);
    await user.clear(field);
    await user.type(field, 'DELET');
    expect(button.disabled).toBe(true);
  });

  test('Enter does nothing unless Delete is enabled', async () => {
    const field = await ready();
    await user.type(field, 'nope{Enter}');
    expect(m.invoke).not.toHaveBeenCalled();
    await user.clear(field);
    await user.type(field, 'DELETE{Enter}');
    await waitFor(() => expect(m.invoke).toHaveBeenCalledTimes(1));
  });

  test('Cancel is a link back to Settings', async () => {
    await ready();
    expect(screen.getByRole('link', { name: 'Cancel' }).getAttribute('href')).toBe('/settings');
  });

  test.each([
    ['sole_member', 'Delete your household first, or invite someone and leave it.'],
    ['last_owner', 'Make someone else an owner first.'],
  ])('a %s blocker shows the copy and the household link, with no confirm', async (key, copy) => {
    m.rpc.mockResolvedValue({ data: key, error: null });
    wrap();
    expect(await screen.findByText(copy)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Go to Household' }).getAttribute('href')).toBe('/settings/household');
    expect(screen.getByText(/Deleting your account is permanent\./)).toBeTruthy();
    expect(screen.queryByLabelText('Type DELETE to confirm')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete my account' })).toBeNull();
  });

  test('a blocker lookup failure shows calm copy and no confirm', async () => {
    m.rpc.mockResolvedValue({ data: null, error: { message: 'boom: secret detail' } });
    wrap();
    expect((await screen.findByRole('alert')).textContent).toBe('Something went wrong. Please try again.');
    expect(screen.queryByLabelText('Type DELETE to confirm')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete my account' })).toBeNull();
  });

  async function confirmDelete() {
    const field = await ready();
    await user.type(field, 'DELETE');
    await user.click(screen.getByRole('button', { name: 'Delete my account' }));
  }

  test.each([
    ['sole_member', 'Delete your household first, or invite someone and leave it.'],
    ['last_owner', 'Make someone else an owner first.'],
  ])('a 409 %s race shows the copy and the household link', async (key, copy) => {
    m.invoke.mockResolvedValue({ data: null, error: httpError(409, { error: key }) });
    await confirmDelete();
    expect((await screen.findByRole('alert')).textContent).toBe(copy);
    expect(screen.getByRole('link', { name: 'Go to Household' }).getAttribute('href')).toBe('/settings/household');
    expect(screen.queryByRole('button', { name: 'Delete my account' })).toBeNull();
    expect(screen.queryByLabelText('Type DELETE to confirm')).toBeNull();
    expect(screen.getByRole('button', { name: 'Export your data first' })).toBeTruthy();
    await waitFor(() => expect(m.rpc).toHaveBeenCalledTimes(2));
  });

  test('a 204 sets the one-shot flag, signs out locally and clears the cache', async () => {
    const clear = vi.spyOn(qc, 'clear');
    qc.setQueryData(['profile', 'u1'], { id: 'u1' });
    await confirmDelete();
    await waitFor(() => expect(clear).toHaveBeenCalled());
    expect(qc.getQueryData(['profile', 'u1'])).toBeUndefined();
    expect(m.invoke).toHaveBeenCalledWith('delete-account', { method: 'POST' });
    expect(sessionStorage.getItem('account-deleted')).toBe('1');
    expect(m.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  test('a failing local sign-out is ignored', async () => {
    m.signOut.mockRejectedValue(new Error('gone'));
    const clear = vi.spyOn(qc, 'clear');
    await confirmDelete();
    await waitFor(() => expect(clear).toHaveBeenCalled());
    expect(sessionStorage.getItem('account-deleted')).toBe('1');
  });

  test.each([
    ['gateway 401 with no error key', httpError(401, { code: 401, message: 'Invalid JWT' })],
    ['an empty 401 body', new FunctionsHttpError(new Response(null, { status: 401 }))],
    ['unauthorized body', httpError(401, { error: 'unauthorized' })],
  ])('%s shows the sign-in copy', async (_n, error) => {
    m.invoke.mockResolvedValue({ data: null, error });
    await confirmDelete();
    expect((await screen.findByRole('alert')).textContent).toBe(SIGN_IN);
    expect(sessionStorage.getItem('account-deleted')).toBeNull();
  });

  test.each([
    ['could_not_delete', httpError(409, { error: 'could_not_delete' })],
    ['a 500 server_error', httpError(500, { error: 'server_error' })],
    ['an unreadable body', new FunctionsHttpError(new Response('<html>', { status: 502 }))],
    ['a fetch error', new FunctionsFetchError(new Error('offline'))],
  ])('%s shows the generic copy and never raw text', async (_n, error) => {
    m.invoke.mockResolvedValue({ data: null, error });
    await confirmDelete();
    expect((await screen.findByRole('alert')).textContent).toBe(GENERIC);
    expect((screen.getByLabelText('Type DELETE to confirm') as HTMLInputElement).disabled).toBe(false);
  });

  test('a double click sends one request', async () => {
    let release: (v: unknown) => void = () => {};
    m.invoke.mockReturnValue(new Promise((r) => (release = r)));
    const field = await ready();
    await user.type(field, 'DELETE');
    const button = screen.getByRole('button', { name: 'Delete my account' });
    await user.dblClick(button);
    expect(m.invoke).toHaveBeenCalledTimes(1);
    expect((field as HTMLInputElement).disabled).toBe(true);
    release({ data: null, error: null });
    await waitFor(() => expect(m.signOut).toHaveBeenCalled());
  });
});
