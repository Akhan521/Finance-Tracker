import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { errorMessage } from '../lib/errors';
import { formatCents, parseCents } from '../lib/money';
import {
  useArchiveBill,
  useBill,
  useBillHistory,
  useCategories,
  useHouseholdNames,
  useMyHousehold,
  useProfile,
  useRestoreBill,
  useUpdateBill,
  type BillDetail,
  type BillPatch,
  type View,
} from '../lib/queries';
import GroupedList from '../ui/GroupedList';
import BillRows from './BillRows';
import { checkFields, type BillFields, type Schedule } from './billFields';
import HistoryTimeline from './HistoryTimeline';
import './bills.css';
import './history.css';
import './pay.css';

const orNull = (s: string) => (s.trim() === '' ? null : s.trim());

function fieldsOf(b: BillDetail): BillFields {
  return {
    amount: formatCents(b.usual_cents),
    due: b.anchor_date,
    schedule: b.schedule as Schedule,
    everyWeeks: b.every_weeks ?? 2,
    categoryId: b.category_id,
    nickname: b.nickname ?? '',
    last4: b.last4 ?? '',
    payUrl: b.pay_url ?? '',
  };
}

// Only the columns that differ from the saved bill, so history records real changes.
function changes(b: BillDetail, name: string, f: BillFields): BillPatch {
  const patch: BillPatch = {};
  const cents = parseCents(f.amount);
  const everyWeeks = f.schedule === 'weeks' ? f.everyWeeks : null;
  if (name.trim() !== b.name) patch.name = name.trim();
  if (cents !== null && cents !== b.usual_cents) patch.usual_cents = cents;
  if (f.categoryId !== null && f.categoryId !== b.category_id) patch.category_id = f.categoryId;
  if (f.schedule !== b.schedule) patch.schedule = f.schedule;
  if (everyWeeks !== b.every_weeks) patch.every_weeks = everyWeeks;
  if (f.due !== b.anchor_date) patch.anchor_date = f.due;
  if (orNull(f.nickname) !== b.nickname) patch.nickname = orNull(f.nickname);
  if (orNull(f.last4) !== b.last4) patch.last4 = orNull(f.last4);
  if (orNull(f.payUrl) !== b.pay_url) patch.pay_url = orNull(f.payUrl);
  return patch;
}

function Unavailable() {
  return (
    <main className="page">
      <p className="page-quiet">This bill isn&apos;t available.</p>
      <Link to="/" className="page-back">
        Back home
      </Link>
    </main>
  );
}

export default function EditBill({ userId }: { userId: string }) {
  const id = useParams().id ?? '';
  const bill = useBill(userId, id);
  if (bill.isPending) {
    return (
      <p role="status" className="loading">
        Loading…
      </p>
    );
  }
  if (bill.isError || !bill.data) return <Unavailable />;
  return <EditForm key={bill.data.id} userId={userId} bill={bill.data} />;
}

function EditForm({ userId, bill }: { userId: string; bill: BillDetail }) {
  const navigate = useNavigate();
  const scope: View = bill.household_id ? 'household' : 'mine';
  const profile = useProfile(userId).data;
  const household = useMyHousehold(userId).data?.households ?? null;
  const categories = useCategories(userId, scope).data ?? [];
  const namesQuery = useHouseholdNames(userId, scope === 'household');
  const names = namesQuery.data ?? [];
  const history = useBillHistory(userId, bill.id).data ?? [];
  const update = useUpdateBill(userId);
  const archive = useArchiveBill(userId);
  const restore = useRestoreBill(userId);

  const [name, setName] = useState(bill.name);
  const [fields, setFields] = useState<BillFields>(() => fieldsOf(bill));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const inFlight = useRef(false); // set synchronously, so a fast double tap can't slip through
  const cancelRef = useRef<HTMLButtonElement>(null);
  const archiveRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);

  useEffect(() => {
    if (confirming) cancelRef.current?.focus();
    else if (returnFocus.current) {
      returnFocus.current = false;
      archiveRef.current?.focus();
    }
  }, [confirming]);

  const patch = changes(bill, name, fields);
  const nameOk = name.trim().length >= 1 && name.trim().length <= 60;
  const canSave = nameOk && checkFields(fields).ok && Object.keys(patch).length > 0 && !busy;

  const timeZone = (scope === 'household' ? household?.time_zone : profile?.time_zone) ?? 'UTC';
  const nameOf = (actorId: string | null): string => {
    // Blank until the names have loaded, so nobody flashes as "Former member".
    if (scope === 'household' && namesQuery.isPending) return '';
    const found =
      actorId === null
        ? null
        : scope === 'household'
          ? names.find((n) => n.profile_id === actorId)?.display_name
          : actorId === userId
            ? profile?.display_name
            : null;
    return found || 'Former member';
  };

  async function run(action: () => Promise<unknown>, after?: () => void) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      await action();
      after?.();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  // Stays on the page after saving so the new history line shows.
  const save = () => {
    if (canSave) void run(() => update.mutateAsync({ billId: bill.id, patch }));
  };
  const doArchive = () => void run(() => archive.mutateAsync(bill.id), () => void navigate('/'));
  const doRestore = () => void run(() => restore.mutateAsync(bill.id));

  const payUrl = bill.pay_url && /^https:\/\/\S+$/.test(bill.pay_url) ? bill.pay_url : null;

  return (
    <main className="page new-bill">
      <header className="new-bill-bar">
        <button type="button" className="bar-link" onClick={() => void navigate('/')}>
          {Object.keys(patch).length > 0 ? 'Cancel' : 'Done'}
        </button>
        <span className="bar-title">Edit bill</span>
        <button type="button" className="bar-link bar-save" disabled={!canSave} onClick={save}>
          Save
        </button>
      </header>

      <input
        className="bill-title"
        aria-label="Bill name"
        placeholder="Bill name"
        autoComplete="off"
        maxLength={60}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      {bill.archived_at && <p className="archived-note">Archived</p>}

      <BillRows userId={userId} scope={scope} value={fields} onChange={setFields} />

      {payUrl && (
        <GroupedList>
          <a className="row" href={payUrl} target="_blank" rel="noopener noreferrer">
            <span>Payment page ↗</span>
          </a>
        </GroupedList>
      )}

      {error && (
        <p role="alert" className="save-error">
          {error}
        </p>
      )}

      <GroupedList label="History">
        {history.length > 0 ? (
          <HistoryTimeline rows={history} nameOf={nameOf} timeZone={timeZone} categories={categories} />
        ) : (
          <p className="history-empty">Nothing yet.</p>
        )}
      </GroupedList>

      <div className="edit-archive">
        {bill.archived_at ? (
          <button type="button" className="pay-link-button" disabled={busy} onClick={doRestore}>
            Restore
          </button>
        ) : confirming ? (
          <div className="pay-confirm" role="group" aria-label="Archive this bill?">
            <span>Archive this bill? It leaves the calendar but keeps its history.</span>
            <button type="button" className="pay-link-button danger" disabled={busy} onClick={doArchive}>
              Archive
            </button>
            <button
              type="button"
              className="pay-link-button"
              disabled={busy}
              ref={cancelRef}
              onClick={() => {
                returnFocus.current = true;
                setConfirming(false);
              }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" className="edit-archive-button" ref={archiveRef} onClick={() => setConfirming(true)}>
            Archive bill
          </button>
        )}
      </div>
    </main>
  );
}
