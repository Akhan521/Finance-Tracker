import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { formatDay, todayIn } from '../lib/calendar';
import { errorMessage } from '../lib/errors';
import {
  useCancelInvite,
  useInvite,
  useMembers,
  useMyHousehold,
  usePendingInvites,
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

// The same rule the invite function enforces.
const EMAIL_OK = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/

const nameOf = (m: Member) => m.display_name || 'Unnamed';
const roleLabel = (m: Member) => (m.role === 'owner' ? 'Owner' : 'Member');

export default function HouseholdScreen({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const household = useMyHousehold(userId);
  const members = useMembers(userId);
  const setRole = useSetRole(userId);
  const removeMember = useRemoveMember(userId);
  const updateHousehold = useUpdateHousehold(userId);
  const pending = usePendingInvites(userId);
  const sendInvite = useInvite(userId);
  const cancelInvite = useCancelInvite(userId);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteNote, setInviteNote] = useState('');
  const [cancelError, setCancelError] = useState('');
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const inviteGuard = useRef(false);
  const cancelGuard = useRef(false);

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
  const trimmedInvite = inviteEmail.trim();
  const emailValid = EMAIL_OK.test(trimmedInvite.toLowerCase());
  const emailBad = trimmedInvite !== '' && !emailValid;
  const list = [...(members.data ?? [])].sort(
    (a, b) => Number(b.role === 'owner') - Number(a.role === 'owner') || nameOf(a).localeCompare(nameOf(b)),
  );
  const target = list.find((x) => x.profile_id === targetId && x.profile_id !== userId) ?? null;

  async function doInvite(e: FormEvent) {
    e.preventDefault();
    const email = inviteEmail.trim();
    if (inviteGuard.current || !email) return;
    if (!EMAIL_OK.test(email.toLowerCase())) {
      setInviteError(errorMessage(new Error('bad_email')));
      return;
    }
    inviteGuard.current = true;
    setInviteBusy(true);
    setInviteError('');
    try {
      await sendInvite.mutateAsync(email);
      setInviteOpen(false);
      setInviteNote(`Invite sent to ${email}.`);
    } catch (err) {
      setInviteError(errorMessage(err));
    } finally {
      inviteGuard.current = false;
      setInviteBusy(false);
    }
  }

  async function doCancel(id: string) {
    if (cancelGuard.current) return;
    cancelGuard.current = true;
    setCancellingId(id);
    setCancelError('');
    setInviteNote('');
    try {
      await cancelInvite.mutateAsync(id);
    } catch (err) {
      setCancelError(errorMessage(err));
    } finally {
      cancelGuard.current = false;
      setCancellingId(null);
    }
  }

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
          <GroupedList label="Pending invites">
            {(pending.data ?? []).map((inv) => (
              <div key={inv.id} className="row">
                <span>
                  {inv.email}
                  <small className="row-caption">
                    Expires {formatDay(todayIn(hh.time_zone, new Date(inv.expires_at)), 'date')}
                  </small>
                </span>
                <button
                  type="button"
                  className="pay-link-button"
                  aria-label={`Cancel invite for ${inv.email}`}
                  disabled={!!cancellingId}
                  onClick={() => void doCancel(inv.id)}
                >
                  Cancel
                </button>
              </div>
            ))}
            <button
              type="button"
              className="row row-button"
              onClick={() => {
                setInviteEmail('');
                setInviteError('');
                setInviteNote('');
                setInviteOpen(true);
              }}
            >
              + Invite someone by email
            </button>
          </GroupedList>
          {pending.isError && (
            <p role="alert" className="save-error">
              {errorMessage(pending.error)}
            </p>
          )}
          {cancelError && (
            <p role="alert" className="save-error">
              {cancelError}
            </p>
          )}
          <p role="status" className="page-quiet settings-note">
            {inviteNote}
          </p>
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

      <Sheet open={inviteOpen} onClose={() => !inviteBusy && setInviteOpen(false)} title="Invite someone">
        <form noValidate onSubmit={(e) => void doInvite(e)}>
          <label className="field">
            <input
              className="field-input"
              type="email"
              aria-invalid={emailBad}
              aria-describedby={emailBad ? 'invite-email-hint' : undefined}
              aria-label="Email address"
              placeholder="Email address"
              autoComplete="off"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
            />
          </label>
          {emailBad && (
            <p id="invite-email-hint" className="page-quiet">
              Enter an email address like name@example.com.
            </p>
          )}
          <p className="settings-note">They'll get an email. They sign in with that address to join.</p>
          {inviteError && (
            <p role="alert" className="save-error">
              {inviteError}
            </p>
          )}
          <button type="submit" className="sheet-done" disabled={inviteBusy || !emailValid}>
            Send invite
          </button>
        </form>
      </Sheet>

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
