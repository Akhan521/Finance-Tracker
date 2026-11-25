import { formatCents } from '../lib/money';
import { monthTotals, type EntryRow } from '../lib/totals';
import './home.css';

export default function Totals({ entries }: { entries: EntryRow[] }) {
  const t = monthTotals(entries);
  const items = [
    { label: 'paid', cents: t.paidCents, tone: 'sage' },
    { label: 'overdue', cents: t.overdueCents, tone: 'rose' },
    { label: 'left', cents: t.leftCents, tone: 'butter' },
  ];
  return (
    <div className="totals">
      {items.map((i) => (
        <div key={i.label}>
          <b>{formatCents(i.cents)}</b>{' '}
          <span>
            <i className="dot" style={{ background: `var(--${i.tone})` }} aria-hidden="true" />
            {i.label}
          </span>
        </div>
      ))}
    </div>
  );
}
