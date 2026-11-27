import { useRef, useState } from 'react';
import { endOfMonth, todayIn } from '../lib/calendar';
import { toCsv } from '../lib/csv';
import { buildExportRows } from '../lib/export';
import { useProfile } from '../lib/queries';

// Builds the person's CSV and downloads it. One export at a time.
export function useCsvExport(userId: string) {
  const profile = useProfile(userId);
  const guard = useRef(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const p = profile.data;

  async function run() {
    if (guard.current || !p) return;
    guard.current = true;
    setExporting(true);
    setError('');
    try {
      const today = todayIn(p.time_zone);
      const csv = toCsv(await buildExportRows(userId, endOfMonth(today)));
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `bills-${today}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url));
    } catch {
      setError("Couldn't prepare your export. Please try again.");
    } finally {
      guard.current = false;
      setExporting(false);
    }
  }

  return { exporting, error, ready: !!p, run };
}
