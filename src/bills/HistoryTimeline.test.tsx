import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import type { HistoryRow } from '../lib/queries';
import HistoryTimeline from './HistoryTimeline';

afterEach(cleanup);

const cats = [
  { id: 'c1', name: 'Utilities', color: '#fbefb5', is_credit_card: false },
  { id: 'c2', name: 'Housing', color: '#f7d9c4', is_credit_card: false },
];
const nameOf = (id: string | null) => (id === 'u1' ? 'Maya' : 'Former member');

let n = 0;
function row(kind: string, detail: Record<string, unknown> = {}, actor: string | null = 'u1'): HistoryRow {
  n += 1;
  return {
    id: n, household_id: 'h1', owner_id: null, bill_id: 'b1', actor_id: actor, kind,
    detail: detail as HistoryRow['detail'], created_at: '2026-11-06T03:00:00Z',
  };
}
const show = (rows: HistoryRow[]) =>
  render(<HistoryTimeline rows={rows} nameOf={nameOf} timeZone="America/Los_Angeles" categories={cats} />);

describe('HistoryTimeline', () => {
  test('a payment is a green dot with the amount', () => {
    show([row('payment_added', { amount_cents: 198000, paid_on: '2026-11-05', due_date: '2026-11-05' })]);
    const item = screen.getByText('Paid $1,980').closest('li') as HTMLElement;
    expect(item.querySelector('.history-dot.pay')).not.toBeNull();
    // 03:00 UTC is still Nov 5 in Los Angeles.
    expect(item.textContent).toContain('Nov 5 · Maya');
  });

  test('an amount change is a lavender dot with was, date and name in grey', () => {
    show([row('bill_changed', { field: 'usual_cents', old: 198000, new: 200000 })]);
    const item = screen.getByText('Amount changed to $2,000').closest('li') as HTMLElement;
    expect(item.querySelector('.history-dot.change')).not.toBeNull();
    expect(item.querySelector('.history-meta')?.textContent).toBe('was $1,980 · Nov 5 · Maya');
  });

  test('a null or unknown actor is a Former member', () => {
    show([row('bill_created', {}, null), row('bill_archived', {}, 'gone')]);
    expect(screen.getAllByText(/Former member/)).toHaveLength(2);
  });

  test('every kind has its copy', () => {
    show([
      row('payment_removed', { amount_cents: 198000 }),
      row('bill_created'),
      row('bill_restored'),
      row('bill_changed', { field: 'name', old: 'Elec', new: 'Power' }),
      row('bill_changed', { field: 'category_id', old: 'c1', new: 'c2' }),
      row('bill_changed', { field: 'category_id', old: 'zzz', new: 'c2' }),
      row('bill_changed', { field: 'every_weeks', old: 2, new: 3 }, 'other'),
      row('bill_changed', { field: 'schedule', old: 'monthly', new: 'yearly' }),
      row('bill_changed', { field: 'anchor_date', old: '2026-11-05', new: '2026-12-05' }),
      row('bill_changed', { field: 'nickname', old: null, new: 'Main' }),
      row('bill_changed', { field: 'nickname', old: 'Main', new: null }),
      row('bill_changed', { field: 'whatever', old: 1, new: 2 }),
      row('mystery_kind'),
    ]);
    for (const t of [
      'Payment of $1,980 removed', 'Bill added', 'Restored', 'Renamed to Power',
      'Schedule changed to Every 3 weeks', 'Schedule changed to Every year',
      'Due date changed to Dec 5', 'Nickname changed to Main', 'Nickname removed',
    ]) expect(screen.getByText(t)).toBeTruthy();
    expect(screen.getAllByText('Category changed to Housing')).toHaveLength(2);
    expect(screen.getAllByText('Bill changed')).toHaveLength(2);
    expect(screen.getByText('was Elec · Nov 5 · Maya')).toBeTruthy();
    expect(screen.getByText('was Utilities · Nov 5 · Maya')).toBeTruthy();
    expect(screen.getByText('was a removed category · Nov 5 · Maya')).toBeTruthy();
    expect(screen.getByText('was Nov 5 · Nov 5 · Maya')).toBeTruthy();
  });

  test('last4 and pay_url never show a value, even if the detail carried one', () => {
    show([
      row('bill_changed', { field: 'last4', old: '1234', new: '9876' }),
      row('bill_changed', { field: 'pay_url', old: 'https://old.example/x', new: 'https://new.example/y' }),
    ]);
    expect(screen.getByText('Last 4 digits changed')).toBeTruthy();
    expect(screen.getByText('Payment link changed')).toBeTruthy();
    const text = document.body.textContent ?? '';
    for (const bad of ['1234', '9876', 'example']) expect(text).not.toContain(bad);
  });

  test('shows no counts', () => {
    show([row('bill_created'), row('bill_archived')]);
    expect(document.body.textContent).not.toMatch(/\b\d+ (events?|changes?|items?)\b/i);
  });

  test('a schedule row and an every_weeks row from the same moment are one line', () => {
    show([
      row('bill_changed', { field: 'schedule', old: 'monthly', new: 'weeks' }),
      row('bill_changed', { field: 'every_weeks', old: null, new: 3 }),
    ]);
    expect(screen.getAllByText(/Schedule changed/)).toHaveLength(1);
    expect(screen.getByText('Schedule changed to Every 3 weeks')).toBeTruthy();
    expect(screen.getByText('was Every month · Nov 5 · Maya')).toBeTruthy();
  });

  test('weeks to monthly merges, keeping the old weeks label', () => {
    show([
      row('bill_changed', { field: 'schedule', old: 'weeks', new: 'monthly' }),
      row('bill_changed', { field: 'every_weeks', old: 2, new: null }),
    ]);
    expect(screen.getAllByText(/Schedule changed/)).toHaveLength(1);
    expect(screen.getByText('Schedule changed to Every month')).toBeTruthy();
    expect(screen.getByText('was Every 2 weeks · Nov 5 · Maya')).toBeTruthy();
  });

  test('an every_weeks-only change still shows, with was', () => {
    show([row('bill_changed', { field: 'every_weeks', old: 2, new: 4 })]);
    expect(screen.getByText('Schedule changed to Every 4 weeks')).toBeTruthy();
    expect(screen.getByText('was Every 2 weeks · Nov 5 · Maya')).toBeTruthy();
  });

  test('every_weeks rows from a different moment are not merged', () => {
    const later = { ...row('bill_changed', { field: 'every_weeks', old: 2, new: 4 }), created_at: '2026-11-07T03:00:00Z' };
    show([row('bill_changed', { field: 'schedule', old: 'monthly', new: 'yearly' }), later]);
    expect(screen.getAllByText(/Schedule changed/)).toHaveLength(2);
  });

  test('Nickname removed keeps the old value as was', () => {
    show([row('bill_changed', { field: 'nickname', old: 'Main', new: null })]);
    expect(screen.getByText('was Main · Nov 5 · Maya')).toBeTruthy();
  });
});
