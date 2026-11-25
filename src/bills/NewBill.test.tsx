import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const m = vi.hoisted(() => ({
  profile: {} as unknown,
  household: {} as unknown,
  categories: [] as unknown[],
  pending: false,
  createBill: vi.fn(),
  createCategory: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({ supabase: { auth: { signOut: vi.fn() } } }));
vi.mock('../lib/queries', () => ({
  useProfile: () => ({ data: m.profile }),
  useMyHousehold: () => ({ data: m.household }),
  useCategories: (_userId: string, scope: string) => ({
    data: m.categories.filter((c) => (c as { scope: string }).scope === scope),
    isError: false,
    isPending: m.pending,
  }),
  useCreateCategory: () => ({ mutateAsync: m.createCategory }),
  useCreateBill: () => ({ mutateAsync: m.createBill }),
}));

import NewBill from './NewBill';

const cats = [
  { id: 'c-h', scope: 'household', name: 'Housing', color: '#F7D9C4', is_credit_card: false },
  { id: 'c-m', scope: 'mine', name: 'Hobbies', color: '#CFE3F7', is_credit_card: false },
];

const wrap = () =>
  render(
    <MemoryRouter initialEntries={['/bills/new']}>
      <Routes>
        <Route path="/" element={<p>home</p>} />
        <Route path="/bills/new" element={<NewBill userId="u1" />} />
      </Routes>
    </MemoryRouter>,
  );

const user = () => userEvent.setup();
type U = ReturnType<typeof user>;
const save = () => screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement;
const row = (label: string) => screen.getByRole('button', { name: new RegExp(`^${label}`) });
const done = (u: U) => u.click(screen.getByRole('button', { name: 'Done' }));

async function setAmount(u: U, text: string) {
  await u.click(row('Amount'));
  await u.type(screen.getByLabelText('Amount'), text);
  await done(u);
}
async function setDue(u: U, iso: string) {
  await u.click(row('Due'));
  await u.type(screen.getByLabelText('Due date'), iso);
  await done(u);
}
async function pickCategory(u: U, name: string) {
  await u.click(row('Category'));
  await u.click(screen.getByRole('button', { name: new RegExp(`^${name}`) }));
}
async function fillValid(u: U) {
  await u.type(screen.getByLabelText('Bill name'), '  Rent ');
  await setAmount(u, '$1,980');
  await setDue(u, '2026-12-01');
  await pickCategory(u, 'Housing');
}

describe('NewBill', () => {
  beforeEach(() => {
    m.profile = { last_view: 'household', time_zone: 'America/Los_Angeles' };
    m.household = { households: { id: 'h1', time_zone: 'America/Los_Angeles' } };
    m.categories = cats;
    m.pending = false;
    m.createBill.mockReset().mockResolvedValue(undefined);
    m.createCategory.mockReset();
  });
  afterEach(cleanup);

  test('Save is disabled until name, amount, due date and category are set', async () => {
    const u = user();
    wrap();
    expect(save().disabled).toBe(true);
    await u.type(screen.getByLabelText('Bill name'), 'Rent');
    expect(save().disabled).toBe(true);
    await setAmount(u, '1980');
    expect(save().disabled).toBe(true);
    await setDue(u, '2026-12-01');
    expect(save().disabled).toBe(true);
    await pickCategory(u, 'Housing');
    expect(save().disabled).toBe(false);
  });

  test('the amount row shows the parsed amount once valid, and refuses bad ones', async () => {
    const u = user();
    wrap();
    await setAmount(u, '-5');
    expect(row('Amount').textContent).not.toContain('$5');
    await u.click(row('Amount'));
    expect(screen.getByRole('alert').textContent).toMatch(/amount/i);
    await u.clear(screen.getByLabelText('Amount'));
    await u.type(screen.getByLabelText('Amount'), '$1,980.5');
    await done(u);
    expect(row('Amount').textContent).toContain('$1,980.50');
  });

  test('Household / Just mine is hidden without a household', () => {
    m.household = null;
    wrap();
    expect(screen.queryByRole('button', { name: 'Household' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Just mine' })).toBeNull();
  });

  test('the switch starts on the last view and switching clears the category', async () => {
    const u = user();
    wrap();
    expect(screen.getByRole('button', { name: 'Household' }).getAttribute('aria-pressed')).toBe('true');
    await fillValid(u);
    expect(save().disabled).toBe(false);
    await u.click(screen.getByRole('button', { name: 'Just mine' }));
    expect(save().disabled).toBe(true);
    expect(row('Category').textContent).not.toContain('Housing');
    await u.click(row('Category'));
    expect(screen.queryByRole('button', { name: /^Housing/ })).toBeNull();
    expect(screen.getByRole('button', { name: /^Hobbies/ })).toBeTruthy();
  });

  test('the schedule picker offers month (day N from the due date), weeks, year and once', async () => {
    const u = user();
    wrap();
    await setDue(u, '2026-12-15');
    expect(row('Due').textContent).toMatch(/day 15/i);
    await u.click(row('Due'));
    const dlg = within(screen.getByRole('dialog'));
    expect(dlg.getByRole('button', { name: /^Every month/ }).textContent).toMatch(/day 15/i);
    expect(dlg.getByRole('button', { name: 'Every few weeks' })).toBeTruthy();
    expect(dlg.getByRole('button', { name: /^Every year/ })).toBeTruthy();
    expect(dlg.getByRole('button', { name: /^Just once/ })).toBeTruthy();
    await u.click(dlg.getByRole('button', { name: 'Every few weeks' }));
    expect((dlg.getByLabelText('Weeks') as HTMLInputElement).value).toBe('2');
    expect(dlg.getByRole('button', { name: 'Every 2 weeks' })).toBeTruthy();
    expect(dlg.getByRole('button', { name: /^Every month/ }).textContent).toBe('Every month (day 15)');
  });

  test('last 4 accepts only 4 digits', async () => {
    const u = user();
    wrap();
    await u.click(row('More details'));
    await u.type(screen.getByLabelText('Last 4 digits'), '12ab');
    expect(screen.getByText('Use exactly 4 digits.')).toBeTruthy();
    await u.clear(screen.getByLabelText('Last 4 digits'));
    await u.type(screen.getByLabelText('Last 4 digits'), '1234');
    expect(screen.queryByText('Use exactly 4 digits.')).toBeNull();
  });

  test('a payment link without https:// shows a calm hint', async () => {
    const u = user();
    wrap();
    await u.click(row('More details'));
    await u.type(screen.getByLabelText('Payment link'), 'http://example.com');
    expect(screen.getByText('Use a link that starts with https://')).toBeTruthy();
    await u.clear(screen.getByLabelText('Payment link'));
    await u.type(screen.getByLabelText('Payment link'), 'https://example.com/pay');
    expect(screen.queryByText('Use a link that starts with https://')).toBeNull();
  });

  test('saving sends exactly the granted insert columns, trimmed, then goes home', async () => {
    const u = user();
    wrap();
    await fillValid(u);
    await u.click(save());
    expect(m.createBill).toHaveBeenCalledTimes(1);
    const payload = m.createBill.mock.calls[0][0];
    expect(Object.keys(payload).sort()).toEqual([
      'anchor_date', 'category_id', 'every_weeks', 'household_id', 'last4', 'name', 'nickname',
      'owner_id', 'pay_url', 'schedule', 'usual_cents',
    ]);
    expect(payload).toEqual({
      household_id: 'h1', owner_id: null, category_id: 'c-h', name: 'Rent', usual_cents: 198000,
      schedule: 'monthly', every_weeks: null, anchor_date: '2026-12-01', nickname: null, last4: null, pay_url: null,
    });
    expect(await screen.findByText('home')).toBeTruthy();
  });

  test('a personal bill carries owner_id; weeks sends every_weeks; details are trimmed', async () => {
    const u = user();
    wrap();
    await u.click(screen.getByRole('button', { name: 'Just mine' }));
    await u.type(screen.getByLabelText('Bill name'), 'Gym');
    await setAmount(u, '30');
    await u.click(row('Due'));
    await u.type(screen.getByLabelText('Due date'), '2026-12-02');
    await u.click(screen.getByRole('button', { name: 'Every few weeks' }));
    await u.clear(screen.getByLabelText('Weeks'));
    await u.type(screen.getByLabelText('Weeks'), '4');
    await done(u);
    await pickCategory(u, 'Hobbies');
    await u.click(row('More details'));
    await u.type(screen.getByLabelText('Nickname'), ' Pool ');
    await u.type(screen.getByLabelText('Last 4 digits'), '0042');
    await u.type(screen.getByLabelText('Payment link'), 'https://example.com/p');
    await done(u);
    await u.click(save());
    expect(m.createBill.mock.calls[0][0]).toEqual({
      household_id: null, owner_id: 'u1', category_id: 'c-m', name: 'Gym', usual_cents: 3000,
      schedule: 'weeks', every_weeks: 4, anchor_date: '2026-12-02', nickname: 'Pool', last4: '0042',
      pay_url: 'https://example.com/p',
    });
  });

  test('a new custom category is added inline with a palette pastel and selected', async () => {
    const u = user();
    m.createCategory.mockResolvedValue({ id: 'c-new', name: 'Pets', color: '#C9EDE6', is_credit_card: false });
    wrap();
    await u.click(row('Category'));
    await u.click(screen.getByRole('button', { name: 'New category' }));
    await u.type(screen.getByLabelText('Category name'), '  Pets ');
    const seafoam = screen.getByRole('button', { name: 'Seafoam' });
    await u.click(seafoam);
    expect(seafoam.getAttribute('aria-pressed')).toBe('true');
    await u.click(screen.getByRole('button', { name: 'Add category' }));
    expect(m.createCategory).toHaveBeenCalledWith({ name: 'Pets', color: '#C9EDE6', scope: 'household' });
    expect(row('Category').textContent).toContain('Pets');
  });

  test('a duplicate category name shows the friendly message', async () => {
    const u = user();
    m.createCategory.mockRejectedValue({ code: '23505', message: 'duplicate key value violates unique constraint' });
    wrap();
    await u.click(row('Category'));
    await u.click(screen.getByRole('button', { name: 'New category' }));
    await u.type(screen.getByLabelText('Category name'), 'Housing');
    await u.click(screen.getByRole('button', { name: 'Add category' }));
    expect((await screen.findByRole('alert')).textContent).toBe('You already have a category with that name.');
  });

  test('double-clicking Save sends one insert', async () => {
    const u = user();
    m.createBill.mockReturnValue(new Promise(() => {}));
    wrap();
    await fillValid(u);
    await u.dblClick(save());
    expect(m.createBill).toHaveBeenCalledTimes(1);
  });

  test('a failed save shows calm copy, never the server text', async () => {
    const u = user();
    m.createBill.mockRejectedValue({ message: 'raw server text' });
    wrap();
    await fillValid(u);
    await u.click(save());
    expect((await screen.findByRole('alert')).textContent).toBe('Something went wrong. Please try again.');
  });

  test('Cancel sends nothing and goes home', async () => {
    const u = user();
    wrap();
    await fillValid(u);
    await u.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(m.createBill).not.toHaveBeenCalled();
    expect(await screen.findByText('home')).toBeTruthy();
  });
  test('summaries use readable dates', async () => {
    const u = user();
    wrap();
    await setDue(u, '2026-12-05');
    expect(row('Due').textContent).toContain('Every month, day 5');
    await u.click(row('Due'));
    await u.click(screen.getByRole('button', { name: /^Every year/ }));
    await done(u);
    expect(row('Due').textContent).toContain('Every year on Dec 5');
    await u.click(row('Due'));
    await u.click(screen.getByRole('button', { name: /^Just once/ }));
    await done(u);
    expect(row('Due').textContent).toContain('Once on Dec 5, 2026');
    await u.click(row('Due'));
    await u.click(screen.getByRole('button', { name: 'Every few weeks' }));
    await done(u);
    expect(row('Due').textContent).toContain('Every 2 weeks from Dec 5');
  });

  test.each(['0', '53', '2.5'])('weeks of %s is refused and Save stays off', async (weeks) => {
    const u = user();
    wrap();
    await fillValid(u);
    await u.click(row('Due'));
    await u.click(screen.getByRole('button', { name: 'Every few weeks' }));
    await u.clear(screen.getByLabelText('Weeks'));
    await u.type(screen.getByLabelText('Weeks'), weeks);
    expect(screen.getByRole('alert').textContent).toMatch(/1 to 52/);
    expect(screen.getByLabelText('Weeks').getAttribute('aria-invalid')).toBe('true');
    await done(u);
    expect(save().disabled).toBe(true);
  });

  test('a name over 60 characters keeps Save off', async () => {
    const u = user();
    wrap();
    await fillValid(u);
    expect(save().disabled).toBe(false);
    fireEvent.change(screen.getByLabelText('Bill name'), { target: { value: 'x'.repeat(61) } });
    expect(save().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Bill name'), { target: { value: 'x'.repeat(60) } });
    expect(save().disabled).toBe(false);
  });

  test('inputs carry the real length limits', async () => {
    const u = user();
    wrap();
    expect(screen.getByLabelText('Bill name').getAttribute('maxlength')).toBe('60');
    await u.click(row('More details'));
    expect(screen.getByLabelText('Nickname').getAttribute('maxlength')).toBe('40');
    expect(screen.getByLabelText('Last 4 digits').getAttribute('maxlength')).toBe('4');
    expect(screen.getByLabelText('Payment link').getAttribute('maxlength')).toBe('500');
  });

  test('a payment link with a space is refused and the hint is described by the input', async () => {
    const u = user();
    wrap();
    await fillValid(u);
    await u.click(row('More details'));
    const input = screen.getByLabelText('Payment link');
    await u.type(input, 'https://exa mple.com');
    const hint = screen.getByText('Use a link that starts with https://');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe(hint.id);
    await done(u);
    expect(save().disabled).toBe(true);
  });

  test('a yearly bill sends schedule yearly and every_weeks null', async () => {
    const u = user();
    wrap();
    await fillValid(u);
    await u.click(row('Due'));
    await u.click(screen.getByRole('button', { name: /^Every year/ }));
    await done(u);
    await u.click(save());
    const payload = m.createBill.mock.calls[0][0];
    expect(payload.schedule).toBe('yearly');
    expect(payload.every_weeks).toBeNull();
  });

  test('while categories load, the picker says so and New category is disabled', async () => {
    const u = user();
    m.pending = true;
    wrap();
    await u.click(row('Category'));
    expect(screen.getByText('Loading…')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'New category' }) as HTMLButtonElement).disabled).toBe(true);
  });

  test('the amount hint is tied to its input', async () => {
    const u = user();
    wrap();
    await u.click(row('Amount'));
    await u.type(screen.getByLabelText('Amount'), 'abc');
    const input = screen.getByLabelText('Amount');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe(screen.getByRole('alert').id);
  });
});
