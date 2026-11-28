import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { errorMessage } from '../lib/errors';
import { useDeleteAccount, useDeletionBlocker } from '../lib/queries';
import { useCsvExport } from './useCsvExport';
import '../bills/bills.css';
import '../bills/pay.css';
import '../Pages.css';
import './settings.css';

const BLOCKED = ['sole_member', 'last_owner'];

export default function DeleteAccount({ userId }: { userId: string }) {
  const blocker = useDeletionBlocker(userId);
  const del = useDeleteAccount();
  const csv = useCsvExport(userId);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState('');
  const [raced, setRaced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refocus, setRefocus] = useState(0);
  const guard = useRef(false);
  const typedRef = useRef<HTMLInputElement>(null);
  // After a failed delete, put focus back in the confirm field.
  useEffect(() => {
    if (refocus > 0) typedRef.current?.focus();
  }, [refocus]);

  const enabled = typed.trim() === 'DELETE';

  async function doDelete(e?: FormEvent) {
    e?.preventDefault();
    if (guard.current || !enabled) return;
    guard.current = true;
    setBusy(true);
    setError('');
    setRaced(false);
    try {
      await del.mutateAsync();
      // The guard stays set on success: the screen is leaving, and a late tap must not delete twice.
    } catch (err) {
      setError(errorMessage(err));
      const race = err instanceof Error && BLOCKED.includes(err.message);
      setRaced(race);
      if (race) void blocker.refetch();
      else setRefocus((n) => n + 1);
      guard.current = false;
      setBusy(false);
    }
  }

  const bar = (
    <header className="new-bill-bar">
      <Link to="/settings" className="bar-link">
        ‹ Settings
      </Link>
      <h1 className="bar-title">Delete account</h1>
      <span className="bar-link" aria-hidden="true" />
    </header>
  );

  const householdLink = (
    <Link to="/settings/household" className="pay-link-button">
      Go to Household
    </Link>
  );

  const blockedBy = blocker.data ?? null;

  return (
    <main className="page new-bill">
      {bar}
      <div className="pay-confirm delete-panel">
        <p>
          Deleting your account is permanent. Your personal bills and their history are deleted. Payments you made on
          household bills stay, labelled "Former member."
        </p>
        <small className="row-caption">Backups may keep deleted data for a short while before it ages out.</small>
        <div className="delete-panel-actions">
          <button
            type="button"
            className="pay-link-button"
            disabled={csv.exporting || !csv.ready || busy}
            onClick={() => void csv.run()}
          >
            {csv.exporting ? 'Preparing…' : 'Export your data first'}
          </button>
        </div>
        {csv.error && (
          <p role="alert" className="save-error">
            {csv.error}
          </p>
        )}
      </div>

      {blocker.isPending && (
        <p role="status" className="page-quiet">
          Loading…
        </p>
      )}
      {blocker.isError && (
        <p role="alert" className="save-error">
          {errorMessage(blocker.error)}
        </p>
      )}
      {blockedBy && (
        <div className="pay-confirm delete-panel">
          <p role="alert" className="save-error">
            {errorMessage(new Error(blockedBy))}
          </p>
          <div className="delete-panel-actions">{householdLink}</div>
        </div>
      )}
      {raced && !blockedBy && (
        <div className="pay-confirm delete-panel">
          <p role="alert" className="save-error">
            {error}
          </p>
          <div className="delete-panel-actions">{householdLink}</div>
        </div>
      )}
      {blocker.data === null && !raced && (
        <form className="pay-confirm delete-panel" onSubmit={(e) => void doDelete(e)}>
          <label className="field">
            <span className="field-label">Type DELETE to confirm</span>
            <input
              ref={typedRef}
              className="field-input"
              type="text"
              autoComplete="off"
              autoCapitalize="characters"
              disabled={busy}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
          </label>
          {error && (
            <p role="alert" className="save-error">
              {error}
            </p>
          )}
          <div className="delete-panel-actions">
            <button type="submit" className="pay-link-button danger" disabled={busy || !enabled}>
              Delete my account
            </button>
            <Link
              to="/settings"
              className="pay-link-button"
              aria-disabled={busy}
              tabIndex={busy ? -1 : undefined}
              onClick={(e) => busy && e.preventDefault()}
            >
              Cancel
            </Link>
          </div>
        </form>
      )}
    </main>
  );
}
