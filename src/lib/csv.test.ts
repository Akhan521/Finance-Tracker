import { expect, test } from 'vitest';
import { toCsv, type ExportRow } from './csv';

function exportRow(over: Partial<ExportRow> = {}): ExportRow {
  return {
    bill: 'Rent',
    scope: 'Household',
    category: 'Housing',
    dueDate: '2026-10-01',
    status: 'paid',
    expected: '1980.00',
    paymentAmount: '1980.00',
    paidOn: '2026-10-01',
    paidBy: 'Al',
    ...over,
  };
}

test('csv neutralizes formulas and quotes commas, quotes and newlines', () => {
  const out = toCsv([exportRow({ bill: '=HYPERLINK("x")', category: 'Car, loan', paidBy: 'Al "Mo"' })]);
  expect(out).toContain(`"'=HYPERLINK(""x"")"`);
  expect(out).toContain('"Car, loan"');
  expect(out).toContain('"Al ""Mo"""');
});

test('header line is exact, with CRLF endings, quoted fields, after a BOM', () => {
  const out = toCsv([exportRow()]);
  expect(out.charCodeAt(0)).toBe(0xfeff);
  const [header, data, end] = out.slice(1).split('\r\n');
  expect(header).toBe(
    '"Bill","Household or mine","Category","Due date","Status","Expected","Payment amount","Paid on","Paid by"',
  );
  expect(data).toBe('"Rent","Household","Housing","2026-10-01","paid","1980.00","1980.00","2026-10-01","Al"');
  expect(end).toBe('');
  expect(out).not.toMatch(/(?<!\r)\n/);
});

test('no rows gives just the header', () => {
  expect(toCsv([]).split('\r\n')).toHaveLength(2);
});

test.each(['=', '+', '-', '@', '\t', '\r', '\n'])('a cell starting with %j is prefixed with an apostrophe', (ch) => {
  const out = toCsv([exportRow({ bill: `${ch}x` })]);
  expect(out).toContain(`"'${ch}x"`);
});

test('only the first character matters; safe cells are untouched', () => {
  const out = toCsv([exportRow({ bill: 'a=b', category: "'=x" })]);
  expect(out).toContain('"a=b"');
  expect(out).toContain(`"'=x"`);
  expect(out).not.toContain(`"''=x"`);
});

test('newlines stay inside the quotes and an empty field is an empty quoted pair', () => {
  const out = toCsv([exportRow({ bill: 'a\nb', paidBy: '', paidOn: '' })]);
  expect(out).toContain('"a\nb"');
  expect(out).toContain('"2026-10-01","paid","1980.00","1980.00","",""');
});
