import { parseCents } from '../lib/money';

export type Schedule = 'monthly' | 'weeks' | 'yearly' | 'once';

// What the rows edit. Text stays as typed; parsing happens in checkFields.
export type BillFields = {
  amount: string;
  due: string; // YYYY-MM-DD, becomes anchor_date
  schedule: Schedule;
  everyWeeks: number;
  categoryId: string | null;
  nickname: string;
  last4: string;
  payUrl: string;
};

export const EMPTY_FIELDS: BillFields = {
  amount: '',
  due: '',
  schedule: 'monthly',
  everyWeeks: 2,
  categoryId: null,
  nickname: '',
  last4: '',
  payUrl: '',
};

export const HINTS = {
  amount: 'Enter an amount like $120 or 49.99.',
  due: 'Pick a date.',
  weeks: 'Use a number from 1 to 52.',
  nickname: 'Keep it to 40 characters.',
  last4: 'Use exactly 4 digits.',
  payUrl: 'Use a link that starts with https://',
} as const;

export function isRealDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

export function dayOfMonth(iso: string): number | null {
  return isRealDate(iso) ? Number(iso.slice(8, 10)) : null;
}

export type FieldChecks = {
  cents: number | null;
  dueOk: boolean;
  weeksOk: boolean;
  nicknameOk: boolean;
  last4Ok: boolean;
  payUrlOk: boolean;
  categoryOk: boolean;
  detailsOk: boolean;
  ok: boolean;
};

export function checkFields(f: BillFields): FieldChecks {
  const cents = parseCents(f.amount);
  const nick = f.nickname.trim();
  const last4 = f.last4.trim();
  const url = f.payUrl.trim();
  const dueOk = isRealDate(f.due);
  const weeksOk = f.schedule !== 'weeks' || (Number.isInteger(f.everyWeeks) && f.everyWeeks >= 1 && f.everyWeeks <= 52);
  const nicknameOk = nick.length <= 40;
  const last4Ok = last4 === '' || /^[0-9]{4}$/.test(last4);
  const payUrlOk = url === '' || (/^https:\/\/\S+$/.test(url) && url.length <= 500);
  const categoryOk = f.categoryId !== null;
  const detailsOk = nicknameOk && last4Ok && payUrlOk;
  return {
    cents, dueOk, weeksOk, nicknameOk, last4Ok, payUrlOk, categoryOk, detailsOk,
    ok: cents !== null && dueOk && weeksOk && categoryOk && detailsOk,
  };
}

const orNull = (s: string) => (s.trim() === '' ? null : s.trim());

// Always the same 11 granted insert keys; empty optionals are null.
export function buildPayload(
  name: string,
  f: BillFields,
  scope: 'household' | 'mine',
  ids: { userId: string; householdId: string | null },
) {
  return {
    household_id: scope === 'household' ? ids.householdId : null,
    owner_id: scope === 'mine' ? ids.userId : null,
    category_id: f.categoryId as string,
    name: name.trim(),
    usual_cents: parseCents(f.amount) as number,
    schedule: f.schedule,
    every_weeks: f.schedule === 'weeks' ? f.everyWeeks : null,
    anchor_date: f.due,
    nickname: orNull(f.nickname),
    last4: orNull(f.last4),
    pay_url: orNull(f.payUrl),
  };
}
