import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { errorMessage } from '../lib/errors';
import { useCreateBill, useMyHousehold, useProfile, type View } from '../lib/queries';
import BillRows from './BillRows';
import { buildPayload, checkFields, EMPTY_FIELDS, type BillFields } from './billFields';
import './bills.css';

export default function NewBill({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const profile = useProfile(userId).data;
  const householdId = useMyHousehold(userId).data?.households?.id ?? null;
  const createBill = useCreateBill(userId);

  const [picked, setPicked] = useState<View>(profile?.last_view === 'mine' ? 'mine' : 'household');
  const scope: View = householdId ? picked : 'mine';
  const [name, setName] = useState('');
  const [fields, setFields] = useState<BillFields>(EMPTY_FIELDS);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);

  const nameOk = name.trim().length >= 1 && name.trim().length <= 60;
  const canSave = nameOk && checkFields(fields).ok && !saving;

  function chooseScope(next: View) {
    if (next === scope) return;
    setPicked(next);
    // Categories belong to one scope, so a chosen one can't carry over.
    setFields((f) => ({ ...f, categoryId: null }));
  }

  async function save() {
    if (!canSave || inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setError('');
    try {
      await createBill.mutateAsync(buildPayload(name, fields, scope, { userId, householdId }));
      void navigate('/');
    } catch (e) {
      setError(errorMessage(e));
      inFlight.current = false;
      setSaving(false);
    }
  }

  return (
    <main className="page new-bill">
      <header className="new-bill-bar">
        <button type="button" className="bar-link" onClick={() => void navigate('/')}>
          Cancel
        </button>
        <span className="bar-title">New bill</span>
        <button type="button" className="bar-link bar-save" disabled={!canSave} onClick={() => void save()}>
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

      {householdId && (
        <div className="seg new-bill-seg">
          {(['household', 'mine'] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={scope === s}
              className={scope === s ? 'on' : ''}
              onClick={() => chooseScope(s)}
            >
              {s === 'household' ? 'Household' : 'Just mine'}
            </button>
          ))}
        </div>
      )}

      <BillRows userId={userId} scope={scope} value={fields} onChange={setFields} />

      {error && (
        <p role="alert" className="save-error">
          {error}
        </p>
      )}
    </main>
  );
}
