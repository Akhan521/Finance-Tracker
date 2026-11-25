import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { formatDay, todayIn } from '../lib/calendar';
import { errorMessage } from '../lib/errors';
import { formatCents, parseCents } from '../lib/money';
import {
  useAddPayment,
  useEntry,
  useEntryPayments,
  useHouseholdNames,
  useMyHousehold,
  useProfile,
  useRemovePayment,
  useSaveCardFigures,
  useUpdateBill,
  type EntryDetail,
} from '../lib/queries';
import GroupedList from '../ui/GroupedList';
import Sheet from '../ui/Sheet';
import Switch from '../ui/Switch';
import './pay.css';

type Props = { userId: string; entryId: string; onClose: () => void };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// A figure field: blank is allowed (null), otherwise it must be a clear amount.
function parseFigure(text: string): { ok: boolean; cents: number | null } {
  if (text.trim() === '') return { ok: true, cents: null };
  const cents = parseCents(text);
  return { ok: cents !== null, cents };
}

export default function PaySheet({ userId, entryId, onClose }: Props) {
  const entry = useEntry(userId, entryId);
  if (!entry.data) {
    return (
      <Sheet open onClose={onClose} title="Bill">
        {entry.isError ? (
          <p role="alert" className="page-quiet">
            {errorMessage(entry.error)}
          </p>
        ) : (
          <p className="page-quiet">Loading…</p>
        )}
      </Sheet>
    );
  }
  return <PayForm key={entry.data.id} userId={userId} entry={entry.data} onClose={onClose} />;
}

function PayForm({ userId, entry, onClose }: { userId: string; entry: EntryDetail; onClose: () => void }) {
  const profile = useProfile(userId).data;
  const household = useMyHousehold(userId).data?.households ?? null;
  const payments = useEntryPayments(userId, entry.id).data ?? [];
  const names = useHouseholdNames(userId, entry.householdId !== null).data ?? [];
  const addPayment = useAddPayment(userId);
  const removePayment = useRemovePayment(userId);
  const saveFigures = useSaveCardFigures(userId);
  const updateBill = useUpdateBill(userId);

  // "Today" is the scope's local date: the household's, or the person's own.
  const zone = (entry.householdId ? household?.time_zone : profile?.time_zone) ?? 'UTC';
  const today = todayIn(zone);

  const navigate = useNavigate();
  const hasMinimum = entry.isCreditCard && entry.minimumCents !== null;
  // Already paid (or part paid): offer the remainder, blank when nothing is left,
  // so a second tap can't quietly double the payment.
  const remainder = entry.targetCents - entry.paidCents;
  const initialAmount =
    entry.paidCents > 0
      ? remainder > 0
        ? formatCents(remainder)
        : ''
      : formatCents(hasMinimum ? entry.targetCents : entry.usualCents);
  const [amountText, setAmountText] = useState(initialAmount);
  const [amountTouched, setAmountTouched] = useState(false);
  // Until the person picks a date it follows today, which can change once the
  // profile or household time zone has loaded.
  const [pickedOn, setPickedOn] = useState<string | null>(null);
  const paidOn = pickedOn ?? today;
  const [useFromNowOn, setUseFromNowOn] = useState(false);
  const [minText, setMinText] = useState(entry.minimumCents === null ? '' : formatCents(entry.minimumCents));
  const [stmtText, setStmtText] = useState(entry.statementCents === null ? '' : formatCents(entry.statementCents));
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const removeRefs = useRef(new Map<string, HTMLButtonElement>());
  const returnFocusTo = useRef<string | null>(null);
  const inFlight = useRef(false); // set synchronously, so a fast double tap can't slip through

  useEffect(() => {
    if (confirmId) cancelRef.current?.focus();
    else if (returnFocusTo.current) {
      removeRefs.current.get(returnFocusTo.current)?.focus();
      returnFocusTo.current = null;
    }
  }, [confirmId]);

  const cents = parseCents(amountText);
  const min = parseFigure(minText);
  const stmt = parseFigure(stmtText);
  const figuresOk = !entry.isCreditCard || (min.ok && stmt.ok);
  const figuresChanged =
    entry.isCreditCard && figuresOk && (min.cents !== entry.minimumCents || stmt.cents !== entry.statementCents);
  const dateOk = ISO_DATE.test(paidOn) && paidOn <= today;
  const canPay = cents !== null && dateOk && figuresOk && !busy;

  // The "usually" row only makes sense against the bill's usual amount. A card
  // with a minimum has a figure that changes each cycle, so it is left out there.
  const showUsual = cents !== null && cents !== entry.usualCents &&
    !(entry.isCreditCard && min.cents !== null) &&
    (entry.paidCents === 0 || amountTouched);

  // "Minimum covered" means the payments already recorded reach the minimum
  // (the same rule as the entry's paid status). The amount still being typed
  // is not counted; it only earns a hint.
  const covered = min.cents !== null && entry.paidCents >= min.cents;
  const wouldCover = !covered && min.cents !== null && cents !== null && entry.paidCents + cents >= min.cents;

  const payerName = (paidBy: string | null) => {
    if (!paidBy) return 'Former member';
    if (paidBy === userId) return profile?.display_name || 'Someone';
    const found = names.find((n) => n.profile_id === paidBy);
    return found ? found.display_name || 'Someone' : 'Former member';
  };

  async function run(task: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      await task();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const saveCardFigures = () =>
    saveFigures.mutateAsync({ entryId: entry.id, minimumCents: min.cents, statementCents: stmt.cents });

  function markPaid() {
    if (!canPay || cents === null) return;
    void run(async () => {
      // The usual amount goes first: if it fails, nothing else is recorded.
      let usualSaved = false;
      if (showUsual && useFromNowOn) {
        await updateBill.mutateAsync({ billId: entry.billId, patch: { usual_cents: cents } });
        usualSaved = true;
      }
      try {
        if (figuresChanged) await saveCardFigures();
        await addPayment.mutateAsync({ entryId: entry.id, amountCents: cents, paidOn });
      } catch (e) {
        if (!usualSaved) throw e;
        setError('Usual amount saved, payment not recorded. Try again.');
        return;
      }
      onClose();
    });
  }

  function close() {
    // Figures typed on a card are kept even if nothing is paid.
    if (inFlight.current) return;
    if (!figuresChanged) {
      onClose();
      return;
    }
    void run(async () => {
      await saveCardFigures();
      onClose();
    });
  }

  function remove(paymentId: string) {
    void run(async () => {
      await removePayment.mutateAsync({ paymentId, entryId: entry.id });
      returnFocusTo.current = null;
      setConfirmId(null);
      amountRef.current?.focus();
    });
  }

  // Changed card figures are saved before leaving for the bill page, as on close.
  function openBill(e: React.MouseEvent) {
    if (!figuresChanged || inFlight.current) return;
    e.preventDefault();
    void run(async () => {
      await saveCardFigures();
      void navigate(`/bills/${entry.billId}`);
    });
  }

  const title = (
    <Link to={`/bills/${entry.billId}`} className="pay-title" onClick={openBill}>
      {entry.billName}
    </Link>
  );
  const link = entry.payUrl && /^https:\/\//.test(entry.payUrl) ? entry.payUrl : null;

  return (
    <Sheet open onClose={close} title={title}>
      <div className="pay-head">
        <p className="pay-sub">
          {entry.categoryName ? `${entry.categoryName} · ` : ''}due {formatDay(entry.dueDate)}
        </p>
        {entry.status === 'overdue' && <span className="pay-pill">Overdue</span>}
        {entry.status === 'paid' && <span className="pay-pill paid">Paid</span>}
      </div>

      {entry.isCreditCard && (
        <GroupedList>
          <label className="row">
            <span>Minimum due</span>
            <input
              className="pay-figure"
              inputMode="decimal"
              placeholder="Optional"
              value={minText}
              onChange={(e) => setMinText(e.target.value)}
            />
          </label>
          <label className="row">
            <span>Statement balance</span>
            <input
              className="pay-figure"
              inputMode="decimal"
              placeholder="Optional"
              value={stmtText}
              onChange={(e) => setStmtText(e.target.value)}
            />
          </label>
        </GroupedList>
      )}
      {!figuresOk && <p className="pay-hint">Figures look like $35 or 35.50, or leave them blank.</p>}

      <label className="pay-amount-field">
        <span className="pay-amount-label">Amount paid</span>
        <input
          ref={amountRef}
          className="pay-amount"
          inputMode="decimal"
          autoComplete="off"
          value={amountText}
          onChange={(e) => {
            setAmountTouched(true);
            setAmountText(e.target.value);
          }}
        />
      </label>
      {cents === null && amountTouched && <p className="pay-hint">Enter an amount like $60 or 60.50.</p>}
      {showUsual && <p className="pay-under">usually {formatCents(entry.usualCents)}</p>}
      {covered && <p className="pay-covered">Minimum covered ✓</p>}
      {wouldCover && <p className="pay-under">This will cover the minimum</p>}

      <GroupedList>
        <label className="row">
          <span>Paid on</span>
          <input type="date" className="pay-date" value={paidOn} max={today} onChange={(e) => setPickedOn(e.target.value)} />
        </label>
        {showUsual && cents !== null && (
          <div className="row">
            <span>Use {formatCents(cents)} from now on</span>
            <Switch
              checked={useFromNowOn}
              onChange={setUseFromNowOn}
              label={`Use ${formatCents(cents)} from now on`}
            />
          </div>
        )}
      </GroupedList>

      {error && (
        <p role="alert" className="pay-error">
          {error}
        </p>
      )}

      <button type="button" className="pay-submit" disabled={!canPay} onClick={markPaid}>
        Mark paid
      </button>
      {link && (
        <p className="pay-open">
          <a href={link} target="_blank" rel="noopener noreferrer">
            Open payment page ↗
          </a>
        </p>
      )}

      {payments.length > 0 && (
        <GroupedList label="Recorded">
          {payments.map((p) => (
            <div key={p.id} className="pay-recorded">
              <div className="row">
                <span>{`${formatCents(p.amount_cents)} on ${formatDay(p.paid_on, 'date')}, ${payerName(p.paid_by)}`}</span>
                {confirmId !== p.id && (
                  <button
                    type="button"
                    className="pay-link-button"
                    disabled={busy}
                    ref={(el) => {
                      if (el) removeRefs.current.set(p.id, el);
                      else removeRefs.current.delete(p.id);
                    }}
                    onClick={() => setConfirmId(p.id)}
                  >
                    Remove
                  </button>
                )}
              </div>
              {confirmId === p.id && (
                <div className="pay-confirm" role="group" aria-label="Remove this payment?">
                  <span>Remove this payment?</span>
                  <button type="button" className="pay-link-button danger" disabled={busy} onClick={() => remove(p.id)}>
                    Remove
                  </button>
                  <button
                    type="button"
                    className="pay-link-button"
                    disabled={busy}
                    ref={cancelRef}
                    onClick={() => {
                      returnFocusTo.current = p.id;
                      setConfirmId(null);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          ))}
        </GroupedList>
      )}
    </Sheet>
  );
}
