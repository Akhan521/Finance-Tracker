import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { errorMessage } from '../lib/errors';
import {
  useMembers,
  useMyHousehold,
  useRemoveMember,
  useSetRole,
  useUpdateHousehold,
  type Member,
} from '../lib/queries';
import GroupedList from '../ui/GroupedList';
import Picker from '../ui/Picker';
import Sheet from '../ui/Sheet';
import LeaveHousehold from './LeaveHousehold';
import '../bills/bills.css';
import '../bills/pay.css';
import '../Pages.css';
import './settings.css';

const KEEP_OPTIONS = [
  { value: '12', label: '1 year' },
  { value: '24', label: '2 years' },
  { value: '36', label: '3 years' },
  { value: '60', label: '5 years' },
  { value: 'never', label: 'Never' },
];

const nameOf = (m: Member) => m.display_name || 'Unnamed';
const roleLabel = (m: Member) => (m.role === 'owner' ? 'Owner' : 'Member');

export default function HouseholdScreen({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const household = useMyHousehold(userId);
  const members = useMembers(userId);
  const setRole = useSetRole(userId);
  const removeMember = useRemoveMember(userId);
  const updateHousehold = useUpdateHousehold(userId);

  const [targetId, setTargetId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sheetError, setSheetError] = useState('');
  const removeRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  useEffect(() => {
    if (confirming) {
      cancelRef.current?.focus();
    } else if (returnFocus.current) {
      removeRef.current?.focus();
      returnFocus.current = false;
    }
  }, [confirming]);

  // The value shown while a Keep history save is in flight.
  const [pendingKeep, setPendingKeep] = useState<{ value: number | null } | null>(null);
  const [keepError, setKeepError] = useState('');

  const hh = household.data?.households ?? null;
  const isOwner = household.data?.role === 'owner';
  const title = hh?.name ?? 'Household';

  const bar = (
    <header className="new-bill-bar">
      <Link to="/settings" className="bar-link">
        ‹ Settings
      </Link>
      <h1 className="bar-title">{title}</h1>
      <span className="bar-link" aria-hidden="true" />
    </header>
  );

  if (household.data === undefined) {
    return (
      <main className="page new-bill">
        {bar}
        {household.isError ? (
          <p role="alert">{errorMessage(household.error)}</p>
        ) : (
          <p role="status" className="page-quiet">
            Loading…
          </p>
        )}
      </main>
    );
  }
  if (!hh) {
    return (
      <main className="page new-bill">
        {bar}
        <p className="page-quiet">You're not in a household.</p>
      </main>
    );
  }

  // Owners first, then by name.
  const list = [...(members.data ?? [])].sort(
    (a, b) => Number(b.role === 'owner') - Number(a.role === 'owner') || nameOf(a).localeCompare(nameOf(b)),
  );
  const target = list.find((x) => x.profile_id === targetId && x.profile_id !== userId) ?? null;

  function closeSheet() {
    if (busy) return;
    setTargetId(null);
    setConfirming(false);
    setSheetError('');
  }

  async function run(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setSheetError('');
    try {
      await action();
      setTargetId(null);
      setConfirming(false);
    } catch (err) {
      setSheetError(errorMessage(err));
      returnFocus.current = confirming;
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  async function saveKeep(v: string) {
    if (pendingKeep || !hh) return;
    const value = v === 'never' ? null : Number(v);
    setPendingKeep({ value });
    setKeepError('');
    try {
      await updateHousehold.mutateAsync({ householdId: hh.id, retention_months: value });
    } catch (err) {
      setKeepError(errorMessage(err));
    } finally {
      setPendingKeep(null);
    }
  }

  const keepValue = pendingKeep ? pendingKeep.value : hh.retention_months;
  const keep = keepValue === null || keepValue === undefined ? 'never' : String(keepValue);

  return (
    <main className="page new-bill">
      {bar}
      <GroupedList label="Members">
        {members.isError && <p role="alert" className="save-error">{errorMessage(members.error)}</p>}
        {!members.data && !members.isError && (
          <p role="status" className="page-quiet">
            Loading…
          </p>
        )}
        {list.map((mem) => {
          const mine = mem.profile_id === userId;
          const label = roleLabel(mem);
          const text = mine ? `${nameOf(mem)} (you)` : nameOf(mem);
          if (isOwner && !mine) {
            return (
              <button
                key={mem.profile_id}
                type="button"
                className="row row-button"
                aria-label={`${nameOf(mem)}, ${label}`}
                onClick={() => {
                  setSheetError('');
                  setConfirming(false);
                  setTargetId(mem.profile_id);
                }}
              >
                <span>{text}</span>
                <span className="row-value">
                  {label}
                  <span aria-hidden="true"> ›</span>
                </span>
              </button>
            );
          }
          return (
            <div key={mem.profile_id} className="row">
              <span>{text}</span>
              <span className="row-value">{label}</span>
            </div>
          );
        })}
      </GroupedList>

      {isOwner && (
        <>
          <GroupedList label="History">
            <Picker
              label="Keep history for"
              caption="Household bills"
              value={keep}
              options={KEEP_OPTIONS}
              disabled={!!pendingKeep}
              onChange={(v) => void saveKeep(v)}
            />
          </GroupedList>
          {keepError && (
            <p role="alert" className="save-error">
              {keepError}
            </p>
          )}
        </>
      )}

      <GroupedList label="Account">
        <LeaveHousehold
          userId={userId}
          household={hh}
          memberCount={members.data?.length}
          onLeft={() => navigate('/settings')}
          soleNote="You're the only member."
        />
      </GroupedList>

      <Sheet open={!!target} onClose={closeSheet} title={target ? nameOf(target) : ''}>
        {target && (
          <>
            <div className="group-rows">
              <button
                type="button"
                className="row row-button"
                disabled={busy}
                onClick={() =>
                  void run(() =>
                    setRole.mutateAsync({
                      householdId: hh.id,
                      profileId: target.profile_id,
                      role: target.role === 'owner' ? 'member' : 'owner',
                    }),
                  )
                }
              >
                {target.role === 'owner' ? 'Make member' : 'Make owner'}
              </button>
              {!confirming && (
                <button
                  ref={removeRef}
                  type="button"
                  className="row row-button"
                  disabled={busy}
                  onClick={() => {
                    setSheetError('');
                    setConfirming(true);
                  }}
                >
                  Remove from household
                </button>
              )}
              {confirming && (
                <div className="pay-confirm" role="group" aria-label={`Remove ${nameOf(target)}?`}>
                  <span>Remove {nameOf(target)}? They'll lose access to the household's bills right away.</span>
                  <button
                    type="button"
                    className="pay-link-button danger"
                    disabled={busy}
                    onClick={() =>
                      void run(() => removeMember.mutateAsync({ householdId: hh.id, profileId: target.profile_id }))
                    }
                  >
                    Remove
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
            </div>
            {sheetError && (
              <p role="alert" className="save-error">
                {sheetError}
              </p>
            )}
          </>
        )}
      </Sheet>
    </main>
  );
}
