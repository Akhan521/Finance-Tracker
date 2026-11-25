import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const m = vi.hoisted(() => ({
  entry: {} as Record<string, unknown> | undefined,
  entryState: {} as { isPending?: boolean; isError?: boolean },
  payments: [] as unknown[],
  names: [] as unknown[],
  profile: {} as unknown,
  household: {} as unknown,
  calls: [] as string[],
  addPayment: vi.fn(),
  removePayment: vi.fn(),
  saveFigures: vi.fn(),
  updateBill: vi.fn(),
}));

vi.mock('../lib/queries', () => ({
  useEntry: () => ({ data: m.entry, isPending: !m.entry, isError: false, ...m.entryState }),
  useEntryPayments: () => ({ data: m.payments }),
  useHouseholdNames: () => ({ data: m.names }),
  useProfile: () => ({ data: m.profile }),
  useMyHousehold: () => ({ data: m.household }),
  useAddPayment: () => ({ mutateAsync: m.addPayment, isPending: false }),
  useRemovePayment: () => ({ mutateAsync: m.removePayment, isPending: false }),
  useSaveCardFigures: () => ({ mutateAsync: m.saveFigures, isPending: false }),
  useUpdateBill: () => ({ mutateAsync: m.updateBill, isPending: false }),
}));
// Fixed "now": 2026-10-05 03:00 UTC. Los Angeles is still Oct 4, Auckland is Oct 5.
vi.mock('../lib/calendar', async (orig) => {
  const real = await orig<typeof import('../lib/calendar')>();
  return { ...real, todayIn: (tz: string) => real.todayIn(tz, new Date('2026-10-05T03:00:00Z')) };
});

import PaySheet from './PaySheet';

const base = {
  id: 'e1', billId: 'b1', dueDate: '2026-10-18', status: 'upcoming', expectedCents: 6000, minimumCents: null,
  statementCents: null, paidCents: 0, targetCents: 6000, isCreditCard: false, householdId: 'h1', ownerId: null,
  billName: 'Water', usualCents: 6000, payUrl: null, categoryName: 'Utilities', categoryColor: '#fbefb5',
};

const onClose = vi.fn();
const wrap = () =>
  render(
    <MemoryRouter>
      <PaySheet userId="u1" entryId="e1" onClose={onClose} />
    </MemoryRouter>,
  );
const amount = () => screen.getByLabelText('Amount paid') as HTMLInputElement;
const markPaid = () => screen.getByRole('button', { name: 'Mark paid' }) as HTMLButtonElement;
const type = async (el: HTMLElement, text: string) => {
  const u = userEvent.setup();
  await u.clear(el);
  if (text) await u.type(el, text);
};

beforeEach(() => {
  m.entry = { ...base };
  m.entryState = {};
  m.payments = [];
  m.names = [{ profile_id: 'u1', display_name: 'Aamir' }];
  m.profile = { display_name: 'Aamir', time_zone: 'Pacific/Auckland' };
  m.household = { households: { id: 'h1', time_zone: 'America/Los_Angeles' } };
  m.calls = [];
  for (const f of [m.addPayment, m.removePayment, m.saveFigures, m.updateBill, onClose]) f.mockReset();
  m.addPayment.mockImplementation(async () => { m.calls.push('add'); });
  m.updateBill.mockImplementation(async () => { m.calls.push('update'); });
  m.saveFigures.mockImplementation(async () => { m.calls.push('figures'); });
  m.removePayment.mockResolvedValue(undefined);
});
afterEach(cleanup);

describe('PaySheet', () => {
  test('pre-fills the usual amount and shows the header', () => {
    wrap();
    expect(amount().value).toBe('$60');
    expect(screen.getByRole('link', { name: 'Water' }).getAttribute('href')).toBe('/bills/b1');
    expect(screen.getByText(/Utilities/)).toBeTruthy();
    expect(screen.getByText(/Oct 18/)).toBeTruthy();
    expect(screen.queryByText('usually $60')).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByText('Overdue')).toBeNull();
  });

  test('shows the Overdue pill for overdue entries', () => {
    m.entry = { ...base, status: 'overdue' };
    wrap();
    expect(screen.getByText('Overdue')).toBeTruthy();
  });

  test('a different amount shows "usually" and an off switch; on updates the bill first, then pays', async () => {
    wrap();
    await type(amount(), '72');
    expect(screen.getByText('usually $60')).toBeTruthy();
    const sw = screen.getByRole('switch', { name: 'Use $72 from now on' });
    expect(sw.getAttribute('aria-checked')).toBe('false');
    await userEvent.setup().click(sw);
    await userEvent.setup().click(markPaid());
    await waitFor(() => expect(m.addPayment).toHaveBeenCalledTimes(1));
    expect(m.updateBill).toHaveBeenCalledWith({ billId: 'b1', patch: { usual_cents: 7200 } });
    expect(m.addPayment).toHaveBeenCalledWith({ entryId: 'e1', amountCents: 7200, paidOn: '2026-10-04' });
    expect(m.calls).toEqual(['update', 'add']);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  test('with the switch off only the payment is recorded', async () => {
    wrap();
    await type(amount(), '72');
    await userEvent.setup().click(markPaid());
    await waitFor(() => expect(m.addPayment).toHaveBeenCalledTimes(1));
    expect(m.updateBill).not.toHaveBeenCalled();
  });

  test('if the bill update fails, no payment is recorded and a calm error shows', async () => {
    m.updateBill.mockRejectedValue(new Error('pg internal detail xyz'));
    wrap();
    await type(amount(), '72');
    await userEvent.setup().click(screen.getByRole('switch'));
    await userEvent.setup().click(markPaid());
    expect((await screen.findByRole('alert')).textContent).toBe('Something went wrong. Please try again.');
    expect(m.addPayment).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  test('usual saved but payment failed says so calmly', async () => {
    m.addPayment.mockRejectedValue(new Error('boom'));
    wrap();
    await type(amount(), '72');
    await userEvent.setup().click(screen.getByRole('switch'));
    await userEvent.setup().click(markPaid());
    expect((await screen.findByRole('alert')).textContent).toBe('Usual amount saved, payment not recorded. Try again.');
  });

  test('a fully paid entry has a blank amount, no hint, a Paid pill, and Mark paid is off', async () => {
    m.entry = { ...base, status: 'paid', paidCents: 6000, targetCents: 6000 };
    wrap();
    expect(amount().value).toBe('');
    expect(markPaid().disabled).toBe(true);
    expect(screen.queryByText(/Enter an amount like/)).toBeNull();
    expect(screen.getByText('Paid')).toBeTruthy();
    await type(amount(), '10');
    expect(markPaid().disabled).toBe(false);
  });

  test('a part paid entry prefills the remainder', () => {
    m.entry = { ...base, paidCents: 2000, targetCents: 6000 };
    wrap();
    expect(amount().value).toBe('$40');
    expect(screen.queryByRole('switch')).toBeNull();
  });

  test('a card paid below its minimum prefills the remaining minimum', () => {
    m.entry = { ...base, isCreditCard: true, minimumCents: 3500, targetCents: 3500, paidCents: 1000 };
    wrap();
    expect(amount().value).toBe('$25');
  });

  test('a failed payment shows a calm message, never the server text', async () => {
    m.addPayment.mockRejectedValue(new Error('duplicate key value violates constraint'));
    wrap();
    await userEvent.setup().click(markPaid());
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Something went wrong. Please try again.');
    expect(document.body.textContent).not.toMatch(/duplicate key/);
  });

  test('money typed the way people type it', async () => {
    wrap();
    await type(amount(), '$1,980');
    expect(markPaid().disabled).toBe(false);
    await userEvent.setup().click(markPaid());
    await waitFor(() => expect(m.addPayment).toHaveBeenCalled());
    expect(m.addPayment.mock.calls[0][0].amountCents).toBe(198000);
  });

  test('1980.5 is $1,980.50', async () => {
    wrap();
    await type(amount(), '1980.5');
    await userEvent.setup().click(markPaid());
    await waitFor(() => expect(m.addPayment).toHaveBeenCalled());
    expect(m.addPayment.mock.calls[0][0].amountCents).toBe(198050);
  });

  test.each(['-5', '12.345', '0', '', 'abc'])('"%s" disables Mark paid and shows a calm hint', async (text) => {
    wrap();
    await type(amount(), text);
    expect(markPaid().disabled).toBe(true);
    expect(screen.getByText(/Enter an amount like/)).toBeTruthy();
    expect(screen.queryByRole('switch')).toBeNull();
  });

  test('double-clicking Mark paid sends one request', async () => {
    let release: () => void = () => {};
    m.addPayment.mockImplementation(() => new Promise<void>((r) => { release = r; }));
    wrap();
    await userEvent.setup().dblClick(markPaid());
    expect(m.addPayment).toHaveBeenCalledTimes(1);
    release();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  test('Paid on defaults to the household time zone today, and caps there', () => {
    wrap();
    const d = screen.getByLabelText('Paid on') as HTMLInputElement;
    expect(d.type).toBe('date');
    expect(d.value).toBe('2026-10-04');
    expect(d.max).toBe('2026-10-04');
  });

  test('personal bills use the profile time zone for today', () => {
    m.entry = { ...base, householdId: null, ownerId: 'u1' };
    wrap();
    const d = screen.getByLabelText('Paid on') as HTMLInputElement;
    expect(d.value).toBe('2026-10-05');
    expect(d.max).toBe('2026-10-05');
  });

  test('a changed date is sent; a future or empty date disables Mark paid', async () => {
    wrap();
    const d = screen.getByLabelText('Paid on');
    fireEvent.change(d, { target: { value: '2026-10-02' } });
    await userEvent.setup().click(markPaid());
    await waitFor(() => expect(m.addPayment).toHaveBeenCalled());
    expect(m.addPayment.mock.calls[0][0].paidOn).toBe('2026-10-02');
    cleanup();
    wrap();
    fireEvent.change(screen.getByLabelText('Paid on'), { target: { value: '2026-10-09' } });
    expect(markPaid().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Paid on'), { target: { value: '' } });
    expect(markPaid().disabled).toBe(true);
  });

  test('"Open payment page" only with a pay_url, opening safely in a new tab', () => {
    wrap();
    expect(screen.queryByText(/Open payment page/)).toBeNull();
    cleanup();
    m.entry = { ...base, payUrl: 'https://pay.example.com/x' };
    wrap();
    const a = screen.getByRole('link', { name: 'Open payment page ↗' });
    expect(a.getAttribute('href')).toBe('https://pay.example.com/x');
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toBe('noopener noreferrer');
  });

  test('bill text renders as text, not markup', () => {
    m.entry = { ...base, billName: '<b>x</b>', categoryName: '=HYPERLINK("a")' };
    const { container } = wrap();
    expect(container.querySelector('b')).toBeNull();
    expect(screen.getByRole('link', { name: '<b>x</b>' })).toBeTruthy();
  });
});

describe('PaySheet, credit card', () => {
  const card = { ...base, isCreditCard: true, billName: 'Visa', usualCents: 15000, expectedCents: 15000, targetCents: 15000 };

  test('shows the minimum and statement fields; regular bills do not', () => {
    wrap();
    expect(screen.queryByLabelText('Minimum due')).toBeNull();
    cleanup();
    m.entry = card;
    wrap();
    expect(screen.getByLabelText('Minimum due')).toBeTruthy();
    expect(screen.getByLabelText('Statement balance')).toBeTruthy();
  });

  test('closing after typing a minimum saves the figures without a payment', async () => {
    m.entry = card;
    wrap();
    await type(screen.getByLabelText('Minimum due'), '$35');
    await userEvent.setup().keyboard('{Escape}');
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(m.saveFigures).toHaveBeenCalledWith({ entryId: 'e1', minimumCents: 3500, statementCents: null });
    expect(m.addPayment).not.toHaveBeenCalled();
  });

  test('closing with nothing changed saves nothing', async () => {
    m.entry = card;
    wrap();
    await userEvent.setup().keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
    expect(m.saveFigures).not.toHaveBeenCalled();
  });

  test('a blank figure clears it; an invalid one is not saved', async () => {
    m.entry = { ...card, minimumCents: 3500, statementCents: 41280 };
    wrap();
    expect((screen.getByLabelText('Minimum due') as HTMLInputElement).value).toBe('$35');
    await type(screen.getByLabelText('Minimum due'), '');
    await userEvent.setup().keyboard('{Escape}');
    await waitFor(() => expect(m.saveFigures).toHaveBeenCalledWith({ entryId: 'e1', minimumCents: null, statementCents: 41280 }));
    cleanup();
    m.saveFigures.mockClear();
    wrap();
    await type(screen.getByLabelText('Statement balance'), '12.345');
    expect(markPaid().disabled).toBe(true);
    await userEvent.setup().keyboard('{Escape}');
    expect(m.saveFigures).not.toHaveBeenCalled();
  });

  test('Mark paid also saves changed figures before the payment', async () => {
    m.entry = card;
    wrap();
    await type(screen.getByLabelText('Minimum due'), '35');
    await userEvent.setup().click(markPaid());
    await waitFor(() => expect(m.addPayment).toHaveBeenCalled());
    expect(m.saveFigures).toHaveBeenCalledWith({ entryId: 'e1', minimumCents: 3500, statementCents: null });
    expect(m.calls).toEqual(['figures', 'add']);
  });

  test('the bill link saves changed figures before leaving', async () => {
    m.entry = card;
    wrap();
    await type(screen.getByLabelText('Minimum due'), '35');
    await userEvent.setup().click(screen.getByRole('link', { name: 'Visa' }));
    await waitFor(() => expect(m.saveFigures).toHaveBeenCalledWith({ entryId: 'e1', minimumCents: 3500, statementCents: null }));
    expect(m.addPayment).not.toHaveBeenCalled();
  });

  test('"Minimum covered" shows when what is already paid reaches the minimum', () => {
    m.entry = { ...card, minimumCents: 3500, targetCents: 3500, paidCents: 3500 };
    wrap();
    expect(screen.getByText('Minimum covered ✓')).toBeTruthy();
  });

  test('not covered yet: no tick, and a typed amount that would cover it is only hinted', async () => {
    m.entry = { ...card, minimumCents: 3500, targetCents: 3500, paidCents: 1000 };
    wrap();
    expect(screen.queryByText('Minimum covered ✓')).toBeNull();
    await type(amount(), '30');
    expect(screen.getByText('This will cover the minimum')).toBeTruthy();
    expect(screen.queryByText('Minimum covered ✓')).toBeNull();
  });

  test('with a minimum entered the amount defaults to it, without a "usually" row', () => {
    m.entry = { ...card, minimumCents: 3500, targetCents: 3500 };
    wrap();
    expect(amount().value).toBe('$35');
    expect(screen.queryByRole('switch')).toBeNull();
  });
});

describe('PaySheet, recorded payments', () => {
  beforeEach(() => {
    m.payments = [
      { id: 'p1', amount_cents: 6000, paid_on: '2026-10-03', paid_by: 'u1' },
      { id: 'p2', amount_cents: 2550, paid_on: '2026-10-01', paid_by: null },
    ];
  });

  test('lists each payment with the name, and "Former member" for a null payer', () => {
    wrap();
    expect(screen.getByText('$60 on Oct 3, Aamir')).toBeTruthy();
    expect(screen.getByText('$25.50 on Oct 1, Former member')).toBeTruthy();
  });

  test('Remove asks inline first, and Cancel keeps the payment', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    wrap();
    const u = userEvent.setup();
    await u.click(screen.getAllByRole('button', { name: 'Remove' })[0]);
    expect(screen.getByText('Remove this payment?')).toBeTruthy();
    expect(m.removePayment).not.toHaveBeenCalled();
    await u.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Remove this payment?')).toBeNull();
    expect(m.removePayment).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
  });

  test('the inline confirm is a labelled group and moves focus to Cancel, then back', async () => {
    wrap();
    const u = userEvent.setup();
    const first = screen.getAllByRole('button', { name: 'Remove' })[0];
    await u.click(first);
    expect(screen.getByRole('group', { name: 'Remove this payment?' })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
    await u.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(document.activeElement).toBe(screen.getAllByRole('button', { name: 'Remove' })[0]);
  });

  test('after a confirmed removal focus moves to the amount field', async () => {
    wrap();
    const u = userEvent.setup();
    await u.click(screen.getAllByRole('button', { name: 'Remove' })[0]);
    await u.click(within(screen.getByRole('group')).getAllByRole('button')[0]);
    await waitFor(() => expect(document.activeElement).toBe(amount()));
  });

  test('confirming Remove calls useRemovePayment', async () => {
    wrap();
    const u = userEvent.setup();
    await u.click(screen.getAllByRole('button', { name: 'Remove' })[0]);
    const confirmRow = screen.getByText('Remove this payment?').parentElement as HTMLElement;
    await u.click(confirmRow.querySelector('button') as HTMLButtonElement);
    await waitFor(() => expect(m.removePayment).toHaveBeenCalledWith({ paymentId: 'p1', entryId: 'e1' }));
  });

  test('a failed remove shows a calm message', async () => {
    m.removePayment.mockRejectedValue(new Error('rls violation'));
    wrap();
    const u = userEvent.setup();
    await u.click(screen.getAllByRole('button', { name: 'Remove' })[0]);
    await u.click((screen.getByText('Remove this payment?').parentElement as HTMLElement).querySelector('button') as HTMLButtonElement);
    expect((await screen.findByRole('alert')).textContent).toBe('Something went wrong. Please try again.');
  });
});

describe('PaySheet, loading', () => {
  test('shows a quiet loading line, then an error line', () => {
    m.entry = undefined;
    wrap();
    expect(screen.getByText('Loading…')).toBeTruthy();
    cleanup();
    m.entryState = { isError: true, isPending: false };
    wrap();
    expect(screen.getByRole('alert').textContent).toBe('Something went wrong. Please try again.');
  });
});
