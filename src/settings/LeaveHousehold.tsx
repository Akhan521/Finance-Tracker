import { useEffect, useRef, useState } from 'react';
import { errorMessage } from '../lib/errors';
import { useHouseholdNames, useLeaveHousehold } from '../lib/queries';

type Props = {
  userId: string;
  household: { id: string; name: string };
  // Called after a successful leave.
  onLeft?: () => void;
  // The caller's own member count, when it has one, so the note and its list agree.
  memberCount?: number;
  // Shown instead of a Leave row when you're the only member.
  soleNote: string; // empty hides it
};

// The Leave row, its inline confirm, its error and the sole-member note. Renders
// rows to sit inside a GroupedList. Shared by Settings and the Household screen.
export default function LeaveHousehold({ userId, household, onLeft, memberCount, soleNote }: Props) {
  const names = useHouseholdNames(userId, memberCount === undefined);
  const leave = useLeaveHousehold(userId);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const returnFocus = useRef(false);
  const leaveRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (confirming) {
      cancelRef.current?.focus();
    } else if (returnFocus.current) {
      leaveRef.current?.focus();
      returnFocus.current = false;
    }
  }, [confirming]);

  async function doLeave() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await leave.mutateAsync(household.id);
      setConfirming(false);
      onLeft?.();
    } catch (err) {
      setError(errorMessage(err));
      returnFocus.current = true;
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  const count = memberCount ?? names.data?.length;
  return (
    <>
      {count !== undefined && count > 1 && !confirming && (
        <button
          ref={leaveRef}
          type="button"
          className="row row-button"
          onClick={() => {
            setError('');
            setConfirming(true);
          }}
        >
          Leave household
        </button>
      )}
      {count !== undefined && count > 1 && confirming && (
        <div className="pay-confirm" role="group" aria-label={`Leave ${household.name}?`}>
          <span>Leave {household.name}? You'll lose access to its bills right away.</span>
          <button type="button" className="pay-link-button danger" disabled={busy} onClick={() => void doLeave()}>
            Leave
          </button>
          <button
            ref={cancelRef}
            type="button"
            className="pay-link-button"
            disabled={busy}
            onClick={() => {
              returnFocus.current = true;
              setConfirming(false);
            }}
          >
            Cancel
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="save-error">
          {error}
        </p>
      )}
      {count === 1 && soleNote && <p className="page-quiet settings-note">{soleNote}</p>}
    </>
  );
}
