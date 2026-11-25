import { useState } from 'react';
import PaySheet from '../bills/PaySheet';
import { formatDay } from '../lib/calendar';
import { formatCents } from '../lib/money';
import type { EntryRow } from '../lib/totals';
import Sheet from '../ui/Sheet';
import './home.css';

type Props = { userId: string; day: string; entries: EntryRow[]; onClose: () => void };

// The bills due on one day. Tapping one opens the pay sheet. No counts anywhere.
export default function DayList({ userId, day, entries, onClose }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const rows = entries.filter((r) => r.dueDate === day);
  return (
    <>
      {/* Closed while the pay sheet is on top, so only one sheet listens for Escape and Tab. */}
      <Sheet open={!openId} onClose={onClose} title={formatDay(day, 'long')}>
        {rows.length === 0 ? (
          <p className="page-quiet">Nothing due.</p>
        ) : (
          <ul className="day-list">
            {rows.map((r) => (
              <li key={r.id}>
                <button type="button" className="day-bill" onClick={() => setOpenId(r.id)}>
                  <span className="day-bill-name">{r.billName}</span>
                  <span className="day-bill-amount">{formatCents(r.targetCents)}</span>
                  <span className={`day-bill-status day-status-${r.status}`}>
                    <span className="day-dot" aria-hidden="true" />
                    {r.status}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
      {openId && <PaySheet userId={userId} entryId={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}
