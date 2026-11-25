import { useEffect, useId, useRef, useState } from 'react';
import { formatDay } from '../lib/calendar';
import { errorMessage } from '../lib/errors';
import { formatCents } from '../lib/money';
import { CATEGORY_PALETTE } from '../lib/palette';
import { useCategories, useCreateCategory, type View } from '../lib/queries';
import GroupedList from '../ui/GroupedList';
import Sheet from '../ui/Sheet';
import { checkFields, dayOfMonth, HINTS, type BillFields, type Schedule } from './billFields';
import './bills.css';

type Props = { userId: string; scope: View; value: BillFields; onChange: (next: BillFields) => void };

const ordinal = (n: number) => `day ${n}`;

function weeksLabel(f: BillFields): string {
  return f.schedule === 'weeks' && Number.isInteger(f.everyWeeks) && f.everyWeeks >= 1 ? `Every ${f.everyWeeks} weeks` : 'Every few weeks';
}

function dueSummary(f: BillFields): string {
  const day = dayOfMonth(f.due);
  if (day === null) return 'Choose';
  switch (f.schedule) {
    case 'monthly':
      return `Every month, ${ordinal(day)}`;
    case 'weeks':
      return `${weeksLabel(f)} from ${formatDay(f.due, 'date')}`;
    case 'yearly':
      return `Every year on ${formatDay(f.due, 'date')}`;
    case 'once':
      return `Once on ${formatDay(f.due, 'date')}, ${f.due.slice(0, 4)}`;
  }
}

function Swatch({ color }: { color: string }) {
  return <i className="swatch" style={{ background: color }} aria-hidden="true" />;
}

// Amount, Due (with how often), Category, and More details. Reused by Edit bill.
export default function BillRows({ userId, scope, value, onChange }: Props) {
  const [open, setOpen] = useState<null | 'amount' | 'due' | 'category' | 'details'>(null);
  const set = (patch: Partial<BillFields>) => onChange({ ...value, ...patch });
  const checks = checkFields(value);
  const close = () => setOpen(null);

  const categories = useCategories(userId, scope);
  const list = categories.data ?? [];
  // A category just made is shown at once, before the list has refetched.
  const [created, setCreated] = useState<{ id: string; name: string; color: string } | null>(null);
  const chosen =
    list.find((c) => c.id === value.categoryId) ?? (created?.id === value.categoryId ? created : null);

  // Categories belong to one scope: when the scope changes, a chosen one can't stay.
  const lastScope = useRef(scope);
  useEffect(() => {
    if (lastScope.current === scope) return;
    lastScope.current = scope;
    if (value.categoryId !== null) onChange({ ...value, categoryId: null });
  }, [scope, value, onChange]);

  const ids = { amount: useId(), weeks: useId(), nickname: useId(), last4: useId(), payUrl: useId() };
  const day = dayOfMonth(value.due);
  const schedules: { value: Schedule; label: string; note: string }[] = [
    { value: 'monthly', label: 'Every month', note: day === null ? '' : ordinal(day) },
    { value: 'weeks', label: weeksLabel(value), note: '' },
    { value: 'yearly', label: 'Every year', note: '' },
    { value: 'once', label: 'Just once', note: '' },
  ];

  const showAmountHint = value.amount.trim() !== '' && checks.cents === null;
  const detailsSummary = !checks.detailsOk ? 'Check these' : value.nickname.trim();

  return (
    <>
      <GroupedList>
        <button type="button" className="row row-button" onClick={() => setOpen('amount')}>
          <span>Amount</span>
          <span className="row-value">{checks.cents !== null ? formatCents(checks.cents) : 'Add'}</span>
        </button>
        <button type="button" className="row row-button" onClick={() => setOpen('due')}>
          <span>Due</span>
          <span className="row-value">{dueSummary(value)} ›</span>
        </button>
        <button type="button" className="row row-button" onClick={() => setOpen('category')}>
          <span>Category</span>
          <span className="row-value">
            {chosen && <Swatch color={chosen.color} />}
            {chosen ? chosen.name : 'Choose'} ›
          </span>
        </button>
      </GroupedList>
      <GroupedList>
        <button type="button" className="row row-button" onClick={() => setOpen('details')}>
          <span>More details</span>
          <span className="row-value">{detailsSummary} ›</span>
        </button>
      </GroupedList>

      <Sheet open={open === 'amount'} onClose={close} title="Usual amount">
        <label className="field">
          <span className="field-label">Amount</span>
          <input
            className="field-input big"
            inputMode="decimal"
            autoComplete="off"
            placeholder="$0"
            aria-invalid={showAmountHint}
            aria-describedby={showAmountHint ? ids.amount : undefined}
            value={value.amount}
            onChange={(e) => set({ amount: e.target.value })}
          />
        </label>
        {showAmountHint && (
          <p role="alert" id={ids.amount} className="hint">
            {HINTS.amount}
          </p>
        )}
        <button type="button" className="sheet-done" onClick={close}>
          Done
        </button>
      </Sheet>

      <Sheet open={open === 'due'} onClose={close} title="Due">
        <label className="field">
          <span className="field-label">Due date</span>
          <input
            type="date"
            className="field-input"
            value={value.due}
            onChange={(e) => set({ due: e.target.value })}
          />
        </label>
        <p className="field-label how-often">How often</p>
        <div className="group-rows">
          {schedules.map((s) => (
            <button
              key={s.value}
              type="button"
              className="row row-button"
              aria-pressed={value.schedule === s.value}
              onClick={() => set({ schedule: s.value })}
            >
              <span>
                {s.note ? `${s.label} (${s.note})` : s.label}
              </span>
              {value.schedule === s.value && <span aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>
        {value.schedule === 'weeks' && (
          <>
            <label className="field">
              <span className="field-label">Weeks</span>
              <input
                type="number"
                min={1}
                max={52}
                aria-invalid={!checks.weeksOk}
                aria-describedby={!checks.weeksOk ? ids.weeks : undefined}
                className="field-input"
                value={Number.isNaN(value.everyWeeks) ? '' : value.everyWeeks}
                onChange={(e) => set({ everyWeeks: e.target.value === '' ? NaN : Number(e.target.value) })}
              />
            </label>
            {!checks.weeksOk && (
              <p role="alert" id={ids.weeks} className="hint">
                {HINTS.weeks}
              </p>
            )}
          </>
        )}
        <button type="button" className="sheet-done" onClick={close}>
          Done
        </button>
      </Sheet>

      <Sheet open={open === 'category'} onClose={close} title="Category">
        <CategoryPicker
          userId={userId}
          scope={scope}
          list={list}
          failed={categories.isError}
          loading={categories.isPending && !categories.isError}
          selectedId={value.categoryId}
          onPick={(id, made) => {
            if (made) setCreated(made);
            set({ categoryId: id });
            close();
          }}
        />
      </Sheet>

      <Sheet open={open === 'details'} onClose={close} title="More details">
        <label className="field">
          <span className="field-label">Nickname</span>
          <input
            className="field-input"
            autoComplete="off"
            maxLength={40}
            aria-invalid={!checks.nicknameOk}
            aria-describedby={!checks.nicknameOk ? ids.nickname : undefined}
            value={value.nickname}
            onChange={(e) => set({ nickname: e.target.value })}
          />
        </label>
        {!checks.nicknameOk && <p id={ids.nickname} className="hint">{HINTS.nickname}</p>}
        <label className="field">
          <span className="field-label">Last 4 digits</span>
          <input
            className="field-input"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            aria-invalid={!checks.last4Ok}
            aria-describedby={!checks.last4Ok ? ids.last4 : undefined}
            value={value.last4}
            onChange={(e) => set({ last4: e.target.value })}
          />
        </label>
        {!checks.last4Ok && <p id={ids.last4} className="hint">{HINTS.last4}</p>}
        <label className="field">
          <span className="field-label">Payment link</span>
          <input
            className="field-input"
            type="url"
            autoComplete="off"
            placeholder="https://"
            maxLength={500}
            aria-invalid={!checks.payUrlOk}
            aria-describedby={!checks.payUrlOk ? ids.payUrl : undefined}
            value={value.payUrl}
            onChange={(e) => set({ payUrl: e.target.value })}
          />
        </label>
        {!checks.payUrlOk && <p id={ids.payUrl} className="hint">{HINTS.payUrl}</p>}
        <button type="button" className="sheet-done" onClick={close}>
          Done
        </button>
      </Sheet>
    </>
  );
}

type PickerProps = {
  userId: string;
  scope: View;
  list: { id: string; name: string; color: string }[];
  failed: boolean;
  loading: boolean;
  selectedId: string | null;
  onPick: (id: string, made?: { id: string; name: string; color: string }) => void;
};

function CategoryPicker({ userId, scope, list, failed, loading, selectedId, onPick }: PickerProps) {
  const create = useCreateCategory(userId);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(CATEGORY_PALETTE[0].color);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const nameHintId = useId();
  const errorId = useId();
  const trimmed = name.trim();
  const nameOk = trimmed.length >= 1 && trimmed.length <= 30;

  async function add() {
    if (busy || !nameOk) return;
    setBusy(true);
    setError('');
    try {
      const made = await create.mutateAsync({ name: trimmed, color, scope });
      onPick(made.id, made);
    } catch (e) {
      const code = e && typeof e === 'object' && 'code' in e ? (e as { code: unknown }).code : null;
      setError(code === '23505' ? 'You already have a category with that name.' : errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {failed && (
        <p role="alert" className="hint">
          We couldn't load your categories.
        </p>
      )}
      {loading && <p className="page-quiet">Loading…</p>}
      <div className="group-rows">
        {list.map((c) => (
          <button
            key={c.id}
            type="button"
            className="row row-button"
            aria-pressed={c.id === selectedId}
            onClick={() => onPick(c.id)}
          >
            <span className="cat-name">
              <Swatch color={c.color} />
              {c.name}
            </span>
            {c.id === selectedId && <span aria-hidden="true">✓</span>}
          </button>
        ))}
        {!adding && (
          <button type="button" className="row row-button new-category" disabled={loading} onClick={() => setAdding(true)}>
            New category
          </button>
        )}
      </div>
      {adding && (
        <div className="new-category-form">
          <label className="field">
            <span className="field-label">Category name</span>
            <input
              className="field-input"
              autoComplete="off"
              maxLength={30}
              aria-invalid={(name.length > 0 && !nameOk) || error !== ''}
              aria-describedby={error ? errorId : name.length > 0 && !nameOk ? nameHintId : undefined}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          {name.length > 0 && !nameOk && <p id={nameHintId} className="hint">Use 1 to 30 characters.</p>}
          <div className="swatch-grid" role="group" aria-label="Colour">
            {CATEGORY_PALETTE.map((p) => (
              <button
                key={p.color}
                type="button"
                className="swatch-button"
                style={{ background: p.color }}
                aria-label={p.name}
                aria-pressed={color === p.color}
                onClick={() => setColor(p.color)}
              />
            ))}
          </div>
          {error && (
            <p role="alert" id={errorId} className="hint">
              {error}
            </p>
          )}
          <button type="button" className="sheet-done" disabled={!nameOk || busy} onClick={() => void add()}>
            Add category
          </button>
        </div>
      )}
    </>
  );
}
