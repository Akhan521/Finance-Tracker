import { formatDay, todayIn } from '../lib/calendar';
import { formatCents } from '../lib/money';
import type { CategoryRow, HistoryRow } from '../lib/queries';
import './history.css';

type Props = {
  rows: HistoryRow[];
  nameOf: (actorId: string | null) => string;
  timeZone: string;
  categories: CategoryRow[];
};

type Detail = { field?: unknown; old?: unknown; new?: unknown; amount_cents?: unknown };

const isText = (v: unknown): v is string => typeof v === 'string' && v !== '';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function scheduleLabel(v: unknown): string | null {
  switch (v) {
    case 'monthly':
      return 'Every month';
    case 'weeks':
      return 'Every few weeks';
    case 'yearly':
      return 'Every year';
    case 'once':
      return 'Just once';
    default:
      return null;
  }
}

const weeks = (v: unknown) => (isNum(v) ? `Every ${v} weeks` : null);
const day = (v: unknown) => (isText(v) && /^\d{4}-\d{2}-\d{2}$/.test(v) ? formatDay(v, 'date') : null);

// The event line and the old value (if any) for one history row. Never reads
// last4 or pay_url values, whatever the detail holds.
function detailOf(row: HistoryRow): Detail {
  return (row.detail && typeof row.detail === 'object' && !Array.isArray(row.detail) ? row.detail : {}) as Detail;
}

// A schedule row and an every_weeks row written in the same moment are one change.
function isSibling(a: HistoryRow, b: HistoryRow): boolean {
  return a.created_at === b.created_at && a.actor_id === b.actor_id && a.bill_id === b.bill_id;
}

function describe(
  row: HistoryRow,
  categories: CategoryRow[],
  weeksRow?: HistoryRow,
): { text: string; was: string | null; pay: boolean } {
  const d = detailOf(row);
  const plain = (text: string, pay = false) => ({ text, was: null, pay });
  switch (row.kind) {
    case 'payment_added':
      return plain(isNum(d.amount_cents) ? `Paid ${formatCents(d.amount_cents)}` : 'Payment added', true);
    case 'payment_removed':
      return plain(isNum(d.amount_cents) ? `Payment of ${formatCents(d.amount_cents)} removed` : 'Payment removed');
    case 'bill_created':
      return plain('Bill added');
    case 'bill_archived':
      return plain('Archived');
    case 'bill_restored':
      return plain('Restored');
    case 'bill_changed':
      break;
    default:
      return plain('Bill changed');
  }
  const change = (text: string, was: string | null) => ({ text, was, pay: false });
  const cat = (v: unknown) =>
    isText(v) ? (categories.find((c) => c.id === v)?.name ?? 'a removed category') : null;
  switch (d.field) {
    case 'usual_cents':
      if (!isNum(d.new)) break;
      return change(`Amount changed to ${formatCents(d.new)}`, isNum(d.old) ? formatCents(d.old) : null);
    case 'name':
      if (!isText(d.new)) break;
      return change(`Renamed to ${d.new}`, isText(d.old) ? d.old : null);
    case 'category_id': {
      const next = cat(d.new);
      return next ? change(`Category changed to ${next}`, cat(d.old)) : plain('Category changed');
    }
    case 'schedule': {
      const w = weeksRow ? detailOf(weeksRow) : null;
      const label = (kind: unknown, n: unknown) => (kind === 'weeks' && isNum(n) ? weeks(n) : scheduleLabel(kind));
      const next = label(d.new, w?.new);
      return next ? change(`Schedule changed to ${next}`, label(d.old, w?.old)) : plain('Schedule changed');
    }
    case 'every_weeks': {
      const next = weeks(d.new);
      return next ? change(`Schedule changed to ${next}`, weeks(d.old)) : plain('Schedule changed');
    }
    case 'anchor_date': {
      const next = day(d.new);
      return next ? change(`Due date changed to ${next}`, day(d.old)) : plain('Due date changed');
    }
    case 'nickname':
      return isText(d.new)
        ? change(`Nickname changed to ${d.new}`, isText(d.old) ? d.old : null)
        : change('Nickname removed', isText(d.old) ? d.old : null);
    case 'last4':
      return plain('Last 4 digits changed');
    case 'pay_url':
      return plain('Payment link changed');
  }
  return plain('Bill changed');
}

export default function HistoryTimeline({ rows, nameOf, timeZone, categories }: Props) {
  return (
    <ol className="history">
      {rows.map((row) => {
        const isWeeks = row.kind === 'bill_changed' && detailOf(row).field === 'every_weeks';
        const isSchedule = row.kind === 'bill_changed' && detailOf(row).field === 'schedule';
        const pair = (field: string) =>
          rows.find((r) => r !== row && r.kind === 'bill_changed' && detailOf(r).field === field && isSibling(r, row));
        // The every_weeks half of a merged change is shown with its schedule row.
        if (isWeeks && pair('schedule')) return null;
        const { text, was, pay } = describe(row, categories, isSchedule ? pair('every_weeks') : undefined);
        const date = formatDay(todayIn(timeZone, new Date(row.created_at)), 'date');
        // An empty name (still loading) is left out rather than shown as "Former member".
        const meta = [was ? `was ${was}` : null, date, nameOf(row.actor_id)].filter(Boolean).join(' · ');
        return (
          <li key={row.id} className="history-item">
            <i className={`history-dot ${pay ? 'pay' : 'change'}`} aria-hidden="true" />
            <div>
              <div className="history-text">{text}</div>
              <div className="history-meta">{meta}</div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
