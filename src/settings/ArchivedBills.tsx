import { useState } from 'react';
import { Link } from 'react-router';
import { errorMessage } from '../lib/errors';
import { useArchivedBills, useRestoreBill, type BillDetail } from '../lib/queries';
import GroupedList from '../ui/GroupedList';
import '../bills/bills.css';
import '../bills/history.css';
import '../bills/pay.css';
import '../Pages.css';

function Row({ bill, busy, onRestore }: { bill: BillDetail; busy: boolean; onRestore: () => void }) {
  return (
    <div className="row">
      <span className="archived-name">
        {bill.categories && <i className="swatch" style={{ background: bill.categories.color }} aria-hidden="true" />}
        {bill.name}
      </span>
      <button type="button" className="pay-link-button" disabled={busy} onClick={onRestore}>
        Restore
      </button>
    </div>
  );
}

export default function ArchivedBills({ userId }: { userId: string }) {
  const archived = useArchivedBills(userId);
  const restore = useRestoreBill(userId);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function doRestore(id: string) {
    if (busyId) return;
    setBusyId(id);
    setError('');
    try {
      await restore.mutateAsync(id); // the list refreshes and the row goes
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  const all = archived.data ?? [];
  const household = all.filter((b) => b.household_id !== null);
  const mine = all.filter((b) => b.household_id === null);
  const section = (label: string, list: BillDetail[]) =>
    list.length > 0 && (
      <GroupedList label={label}>
        {list.map((b) => (
          <Row key={b.id} bill={b} busy={busyId !== null} onRestore={() => void doRestore(b.id)} />
        ))}
      </GroupedList>
    );

  return (
    <main className="page new-bill">
      <header className="new-bill-bar">
        <Link to="/settings" className="bar-link">
          ‹ Settings
        </Link>
        <h1 className="bar-title">Archived bills</h1>
        <span className="bar-link" aria-hidden="true" />
      </header>
      {archived.isPending ? (
        <p role="status" className="page-quiet">
          Loading…
        </p>
      ) : archived.isError && !archived.data ? (
        <p role="alert">{errorMessage(archived.error)}</p>
      ) : all.length === 0 ? (
        <p className="page-quiet">No archived bills.</p>
      ) : (
        <>
          {section('Household', household)}
          {section('Just mine', mine)}
        </>
      )}
      {error && (
        <p role="alert" className="save-error">
          {error}
        </p>
      )}
    </main>
  );
}
