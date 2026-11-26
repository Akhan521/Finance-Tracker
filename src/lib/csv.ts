import type { Status } from './totals';

export type ExportRow = {
  bill: string;
  scope: 'Household' | 'Mine';
  category: string;
  dueDate: string;
  status: Status;
  expected: string;
  paymentAmount: string;
  paidOn: string;
  paidBy: string;
};

const HEADER = ['Bill', 'Household or mine', 'Category', 'Due date', 'Status', 'Expected', 'Payment amount', 'Paid on', 'Paid by'];

/** Quote per RFC 4180, after defusing cells a spreadsheet would run as a formula. */
function cell(value: string): string {
  const safe = /^[=+\-@\t\r\n]/.test(value) ? `'${value}` : value;
  return `"${safe.split('"').join('""')}"`;
}

export function toCsv(rows: ExportRow[]): string {
  const lines = [
    HEADER,
    ...rows.map((r) => [r.bill, r.scope, r.category, r.dueDate, r.status, r.expected, r.paymentAmount, r.paidOn, r.paidBy]),
  ];
  // The BOM makes Excel read accented names as UTF-8.
  return '\uFEFF' + lines.map((l) => l.map(cell).join(',')).join('\r\n') + '\r\n';
}
