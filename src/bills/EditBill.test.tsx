import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const m = vi.hoisted(() => ({
  bill: null as unknown,
  billLoading: false,
  history: [] as unknown[],
  namesPending: false,
  update: vi.fn(),
  archive: vi.fn(),
  restore: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({ supabase: { auth: { signOut: vi.fn() } } }));
vi.mock('../lib/queries', () => ({
  useProfile: () => ({ data: { display_name: 'Maya', time_zone: 'UTC' } }),
  useMyHousehold: () => ({ data: { role: 'owner', households: { id: 'h1', name: 'H', time_zone: 'UTC' } } }),
  useCategories: () => ({
    data: [
      { id: 'c1', name: 'Utilities', color: '#fbefb5', is_credit_card: false },
      { id: 'c2', name: 'Housing', color: '#f7d9c4', is_credit_card: false },
    ],
    isError: false,
    isPending: false,
  }),
  useCreateCategory: () => ({ mutateAsync: vi.fn() }),
  useBill: () => ({ data: m.bill, isPending: m.billLoading, isError: false }),
  useBillHistory: () => ({ data: m.history }),
  useHouseholdNames: () => ({ data: [], isPending: m.namesPending }),
  useUpdateBill: () => ({ mutateAsync: m.update }),
  useArchiveBill: () => ({ mutateAsync: m.archive }),
  useRestoreBill: () => ({ mutateAsync: m.restore }),
}));

import EditBill from './EditBill';

const baseBill = {
  id: 'b1', household_id: 'h1', owner_id: null, category_id: 'c1', name: 'Electric', usual_cents: 12000,
  schedule: 'monthly', every_weeks: null, anchor_date: '2026-11-05', nickname: null, last4: null,
  pay_url: 'https://pay.example/x', is_credit_card: false, archived_at: null, created_at: '2026-01-01T00:00:00Z',
  categories: { name: 'Utilities', color: '#fbefb5' },
};

const wrap = () =>
  render(
    <MemoryRouter initialEntries={['/bills/b1']}>
      <Routes>
        <Route path="/" element={<p>home</p>} />
        <Route path="/bills/:id" element={<EditBill userId="u1" />} />
      </Routes>
    </MemoryRouter>,
  );
const save = () => screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement;

beforeEach(() => {
  m.bill = { ...baseBill };
  m.billLoading = false;
  m.history = [];
  m.namesPending = false;
  m.update.mockReset().mockResolvedValue(undefined);
  m.archive.mockReset().mockResolvedValue(undefined);
  m.restore.mockReset().mockResolvedValue(undefined);
});
afterEach(cleanup);

describe('EditBill', () => {
  test('has no scope switch and shows the bill', () => {
    wrap();
    expect(screen.queryByRole('button', { name: 'Household' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Just mine' })).toBeNull();
    expect((screen.getByLabelText('Bill name') as HTMLInputElement).value).toBe('Electric');
    expect(screen.getByRole('heading', { name: 'History' })).toBeTruthy();
  });

  test('the payment page is a safe new-tab link', () => {
    wrap();
    const a = screen.getByRole('link', { name: /Payment page/ });
    expect(a.getAttribute('href')).toBe('https://pay.example/x');
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toBe('noopener noreferrer');
  });

  test('a non-https link is not rendered as a link', () => {
    m.bill = { ...baseBill, pay_url: 'javascript:alert(1)' };
    wrap();
    expect(screen.queryByRole('link', { name: /Payment page/ })).toBeNull();
  });

  test('a missing bill is calm', () => {
    m.bill = null;
    wrap();
    expect(screen.getByText("This bill isn't available.")).toBeTruthy();
    expect(screen.getByRole('link', { name: /home/i })).toBeTruthy();
  });

  test('Save is disabled with no changes, and sends only the changed keys', async () => {
    const u = userEvent.setup();
    wrap();
    expect(save().disabled).toBe(true);
    const name = screen.getByLabelText('Bill name');
    await u.clear(name);
    await u.type(name, 'Power');
    expect(save().disabled).toBe(false);
    await u.click(save());
    expect(m.update).toHaveBeenCalledTimes(1);
    expect(m.update).toHaveBeenCalledWith({ billId: 'b1', patch: { name: 'Power' } });
  });

  test('Save is disabled when the name is emptied', async () => {
    const u = userEvent.setup();
    wrap();
    await u.clear(screen.getByLabelText('Bill name'));
    expect(save().disabled).toBe(true);
  });

  test('Archive bill asks first, focuses Cancel, and never uses window.confirm', async () => {
    const u = userEvent.setup();
    const spy = vi.spyOn(window, 'confirm');
    wrap();
    await u.click(screen.getByRole('button', { name: 'Archive bill' }));
    expect(screen.getByText(/Archive this bill\? It leaves the calendar but keeps its history\./)).toBeTruthy();
    const group = screen.getByRole('group', { name: 'Archive this bill?' });
    expect(group.contains(document.activeElement)).toBe(true);
    expect((document.activeElement as HTMLElement).textContent).toBe('Cancel');
    expect(m.archive).not.toHaveBeenCalled();
    await u.click(screen.getByRole('button', { name: 'Archive' }));
    expect(m.archive).toHaveBeenCalledWith('b1');
    expect(await screen.findByText('home')).toBeTruthy();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test('cancelling the confirm returns to Archive bill', async () => {
    const u = userEvent.setup();
    wrap();
    await u.click(screen.getByRole('button', { name: 'Archive bill' }));
    await u.click(within_group());
    expect(m.archive).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Archive bill' }));
  });

  test('an archived bill shows a quiet note and Restore instead of Archive', async () => {
    const u = userEvent.setup();
    m.bill = { ...baseBill, archived_at: '2026-11-01T00:00:00Z' };
    wrap();
    expect(screen.getByText('Archived')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Archive bill' })).toBeNull();
    await u.click(screen.getByRole('button', { name: 'Restore' }));
    expect(m.restore).toHaveBeenCalledWith('b1');
  });

  test('shows no counts', () => {
    wrap();
    expect(document.body.textContent).not.toMatch(/\b\d+ (events?|changes?|items?)\b/i);
  });
});

const user = () => userEvent.setup();
const rowBtn = (label: string) => screen.getByRole('button', { name: new RegExp(`^${label}`) });
const done = (u: ReturnType<typeof user>) => u.click(screen.getAllByRole('button', { name: 'Done' }).at(-1) as HTMLElement);
const weeksBill = { ...baseBill, schedule: 'weeks', every_weeks: 2 };

describe('EditBill changed keys', () => {
  test('monthly to weeks sends schedule and every_weeks', async () => {
    const u = user();
    wrap();
    await u.click(rowBtn('Due'));
    await u.click(screen.getByRole('button', { name: 'Every few weeks' }));
    await done(u);
    await u.click(save());
    expect(m.update).toHaveBeenCalledWith({ billId: 'b1', patch: { schedule: 'weeks', every_weeks: 2 } });
  });

  test('weeks to monthly sends every_weeks null with the schedule', async () => {
    const u = user();
    m.bill = weeksBill;
    wrap();
    await u.click(rowBtn('Due'));
    await u.click(screen.getByRole('button', { name: /^Every month/ }));
    await done(u);
    await u.click(save());
    expect(m.update).toHaveBeenCalledWith({ billId: 'b1', patch: { schedule: 'monthly', every_weeks: null } });
  });

  test('clearing the nickname sends nickname null', async () => {
    const u = user();
    m.bill = { ...baseBill, nickname: 'Main' };
    wrap();
    await u.click(rowBtn('More details'));
    await u.clear(screen.getByLabelText('Nickname'));
    await done(u);
    await u.click(save());
    expect(m.update).toHaveBeenCalledWith({ billId: 'b1', patch: { nickname: null } });
  });

  test('retyping the same amount makes no change', async () => {
    const u = user();
    wrap();
    await u.click(rowBtn('Amount'));
    const input = screen.getByLabelText('Amount');
    await u.clear(input);
    await u.type(input, '120.00');
    await done(u);
    expect(save().disabled).toBe(true);
  });

  test('a category change sends only category_id', async () => {
    const u = user();
    wrap();
    await u.click(rowBtn('Category'));
    await u.click(screen.getByRole('button', { name: /^Housing/ }));
    await u.click(save());
    expect(m.update).toHaveBeenCalledWith({ billId: 'b1', patch: { category_id: 'c2' } });
  });
});

describe('EditBill top bar and names', () => {
  test('the top-left says Done until something changes, then Cancel; both go home', async () => {
    const u = user();
    wrap();
    expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy();
    await u.type(screen.getByLabelText('Bill name'), 'x');
    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull();
    await u.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByText('home')).toBeTruthy();
  });

  test('Done goes home', async () => {
    const u = user();
    wrap();
    await u.click(screen.getByRole('button', { name: 'Done' }));
    expect(await screen.findByText('home')).toBeTruthy();
  });

  test('names are not shown as Former member while household names load', () => {
    m.history = [
      { id: 1, household_id: 'h1', owner_id: null, bill_id: 'b1', actor_id: 'u2', kind: 'bill_created', detail: {}, created_at: '2026-11-06T12:00:00Z' },
    ];
    m.namesPending = true;
    wrap();
    expect(document.body.textContent).not.toContain('Former member');
    cleanup();
    m.namesPending = false;
    wrap();
    expect(document.body.textContent).toContain('Former member');
  });
});

function within_group() {
  return screen.getByRole('group', { name: 'Archive this bill?' }).querySelectorAll('button')[1] as HTMLElement;
}
