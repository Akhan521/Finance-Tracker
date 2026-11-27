import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useSignOut } from '../auth/useSignOut';
import { errorMessage } from '../lib/errors';
import {
  useCreateHousehold,
  useMyHousehold,
  useProfile,
  useUpdateProfile,
  type ProfileChanges,
} from '../lib/queries';
import LeaveHousehold from './LeaveHousehold';
import { useCsvExport } from './useCsvExport';
import GroupedList from '../ui/GroupedList';
import Picker from '../ui/Picker';
import Sheet from '../ui/Sheet';
import Switch from '../ui/Switch';
import '../bills/bills.css';
import '../bills/pay.css';
import '../Pages.css';
import './settings.css';

const LEAD_OPTIONS = [1, 2, 3, 5, 7, 10, 14].map((d) => ({
  value: String(d),
  label: `${d} ${d === 1 ? 'day' : 'days'} before`,
}));
const KEEP_OPTIONS = [
  { value: '12', label: '1 year' },
  { value: '24', label: '2 years' },
  { value: '36', label: '3 years' },
  { value: '60', label: '5 years' },
  { value: 'never', label: 'Never' },
];

type Field = keyof ProfileChanges;

// The device's zone, else the profile's, else UTC.
function deviceZone(profileZone: string | undefined): string {
  try {
    const z = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (z) return z;
  } catch {
    // fall through to the profile's zone
  }
  return profileZone || 'UTC';
}

function nameProblem(name: string): string {
  const t = name.trim();
  if (!t) return 'Please enter your name.';
  if (t.length > 40) return 'Please keep your name to 40 characters or fewer.';
  return '';
}

export default function Settings({ userId }: { userId: string }) {
  const profile = useProfile(userId);
  const household = useMyHousehold(userId);
  const update = useUpdateProfile(userId);
  const signOut = useSignOut();
  // Set once by the Household screen after a delete; cleared from history so it doesn't return.
  const navigate = useNavigate();
  const location = useLocation();
  const [deleted] = useState(
    () => (location.state as { householdDeleted?: boolean } | null)?.householdDeleted === true,
  );
  useEffect(() => {
    if (deleted) navigate('.', { replace: true, state: null });
  }, [deleted, navigate]);
  const hhId = household.data?.households?.id ?? null;
  const create = useCreateHousehold(userId);
  const [createOpen, setCreateOpen] = useState(false);
  const [hhName, setHhName] = useState('');
  const [createError, setCreateError] = useState('');
  const [createBusy, setCreateBusy] = useState(false);
  const { exporting, error: exportError, run: doExport } = useCsvExport(userId);
  const createGuard = useRef(false);
  const returnFocus = useRef(false);
  const createRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (returnFocus.current && !hhId) {
      createRef.current?.focus();
      returnFocus.current = false;
    }
  }, [hhId]);
  // Values shown while a save is in flight; dropped when it ends either way.
  const [pending, setPending] = useState<Partial<Record<Field, unknown>>>({});
  // Each field keeps its own last error until that field saves successfully.
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [accountError, setAccountError] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const [nameOpen, setNameOpen] = useState(false);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  const [nameBusy, setNameBusy] = useState(false);
  const p = profile.data;
  const zone = deviceZone(p?.time_zone);

  async function save(field: Field, value: ProfileChanges[Field]) {
    if (field in pending) return; // the control is disabled while saving
    setPending((p) => ({ ...p, [field]: value }));
    try {
      await update.mutateAsync({ [field]: value } as ProfileChanges);
      setErrors((e) => ({ ...e, [field]: '' }));
    } catch (e) {
      setErrors((prev) => ({ ...prev, [field]: errorMessage(e) }));
    } finally {
      setPending((p) => {
        const { [field]: _drop, ...rest } = p;
        return rest;
      });
    }
  }

  async function doSignOut(scope: 'local' | 'global') {
    if (signingOut) return;
    setSigningOut(true);
    setAccountError('');
    try {
      await signOut(scope);
    } catch {
      setAccountError("Couldn't sign out. Please try again.");
      setSigningOut(false);
    }
  }

  async function doCreate(e: FormEvent) {
    e.preventDefault();
    const trimmedName = hhName.trim();
    if (createGuard.current || !trimmedName || trimmedName.length > 40) return;
    createGuard.current = true;
    setCreateBusy(true);
    setCreateError('');
    try {
      await create.mutateAsync({ name: trimmedName, timeZone: zone });
      setCreateOpen(false);
    } catch (err) {
      setCreateError(errorMessage(err));
    } finally {
      createGuard.current = false;
      setCreateBusy(false);
    }
  }

  async function saveName(e: FormEvent) {
    e.preventDefault();
    if (nameBusy || nameProblem(name) || name.trim() === (p?.display_name ?? '')) return;
    setNameBusy(true);
    setNameError('');
    try {
      await update.mutateAsync({ display_name: name.trim() });
      setNameOpen(false);
    } catch (err) {
      setNameError(errorMessage(err));
    } finally {
      setNameBusy(false);
    }
  }

  const bar = (
    <header className="new-bill-bar">
      <Link to="/" className="bar-link">
        ‹ Bills
      </Link>
      <h1 className="bar-title">Settings</h1>
      <span className="bar-link" aria-hidden="true" />
    </header>
  );

  if (!p) {
    return (
      <main className="page new-bill">
        {bar}
        {profile.isError ? (
          <p role="alert">{errorMessage(profile.error)}</p>
        ) : (
          <p role="status" className="page-quiet">
            Loading…
          </p>
        )}
      </main>
    );
  }

  const shown = <K extends Field>(field: K, saved: ProfileChanges[K]) =>
    (field in pending ? pending[field] : saved) as ProfileChanges[K];
  const hh = household.data?.households ?? null;
  const lead = String(shown('lead_days', p.lead_days));
  const keepValue = shown('retention_months', p.retention_months);
  const keep = keepValue === null || keepValue === undefined ? 'never' : String(keepValue);
  const trimmed = name.trim();
  const problem = nameProblem(name);

  return (
    <main className="page new-bill">
      {bar}
      {deleted && (
        <p role="status" className="page-quiet">
          Household deleted.
        </p>
      )}
      <GroupedList label="Email reminders">
        {hh && (
          <div className="row">
            <span>Household bills</span>
            <Switch
              label="Household bills"
              checked={!!shown('remind_household', p.remind_household)}
              disabled={'remind_household' in pending}
              onChange={(v) => void save('remind_household', v)}
            />
          </div>
        )}
        <div className="row">
          <span>My bills</span>
          <Switch
            label="My bills"
            checked={!!shown('remind_personal', p.remind_personal)}
            disabled={'remind_personal' in pending}
            onChange={(v) => void save('remind_personal', v)}
          />
        </div>
        <Picker
          label="First reminder"
          value={lead}
          options={LEAD_OPTIONS}
          disabled={'lead_days' in pending}
          onChange={(v) => void save('lead_days', Number(v))}
        />
      </GroupedList>
      {(errors.remind_household || errors.remind_personal || errors.lead_days) && (
        <p role="alert" className="save-error">
          {errors.remind_household || errors.remind_personal || errors.lead_days}
        </p>
      )}

      <GroupedList label="Your data">
        <button
          type="button"
          className="row row-button"
          disabled={exporting || !p}
          aria-busy={exporting}
          aria-describedby="export-caption"
          onClick={() => void doExport()}
        >
          <span>
            Export to spreadsheet
            <small id="export-caption" className="row-caption">
              CSV of your bills and payments
            </small>
          </span>
          <span className="row-value">{exporting ? 'Preparing…' : ''}</span>
        </button>
        <Picker
          label="Keep history for"
          caption="Your personal bills"
          value={keep}
          options={KEEP_OPTIONS}
          disabled={'retention_months' in pending}
          onChange={(v) => void save('retention_months', v === 'never' ? null : Number(v))}
        />
      </GroupedList>
      <span role="status" className="visually-hidden">
        {exporting ? 'Preparing…' : ''}
      </span>
      {exportError && (
        <p role="alert" className="save-error">
          {exportError}
        </p>
      )}
      {errors.retention_months && (
        <p role="alert" className="save-error">
          {errors.retention_months}
        </p>
      )}

      <GroupedList label="Bills">
        <Link to="/settings/archived" className="row row-button">
          <span>Archived bills</span>
          <span className="row-value" aria-hidden="true">
            ›
          </span>
        </Link>
        {hh && (
          <Link to="/settings/household" className="row row-button">
            <span>Household</span>
            <span className="row-value">{hh.name} ›</span>
          </Link>
        )}
        {!hh && (
          <button
            ref={createRef}
            type="button"
            className="row row-button"
            onClick={() => {
              setHhName('');
              setCreateError('');
              setCreateOpen(true);
            }}
          >
            Create household
          </button>
        )}
      </GroupedList>

      <GroupedList label="Account">
        <button
          type="button"
          className="row row-button"
          onClick={() => {
            setName(p.display_name ?? '');
            setNameError('');
            setNameOpen(true);
          }}
        >
          <span>Name</span>
          <span className="row-value">{p.display_name ?? ""}</span>
        </button>
        <button type="button" className="row row-button" disabled={signingOut} onClick={() => void doSignOut('local')}>
          Sign out
        </button>
        <button type="button" className="row row-button" disabled={signingOut} onClick={() => void doSignOut('global')}>
          Sign out of all devices
        </button>
        {hh && (
          <LeaveHousehold
            userId={userId}
            household={hh}
            onLeft={() => {
              returnFocus.current = true;
            }}
            soleNote="You're the only member. You can delete the household from the Household screen."
          />
        )}
        <Link to="/settings/delete-account" className="row row-button settings-quiet">
          Delete account
        </Link>
      </GroupedList>
      {accountError && (
        <p role="alert" className="save-error">
          {accountError}
        </p>
      )}

      <Sheet open={createOpen} onClose={() => !createBusy && setCreateOpen(false)} title="Create household">
        <form onSubmit={(e) => void doCreate(e)}>
          <label className="field">
            <input
              className="field-input"
              type="text"
              aria-label="Household name"
              placeholder="Household name"
              value={hhName}
              onChange={(e) => setHhName(e.target.value)}
            />
          </label>
          {hhName.trim().length > 40 && (
            <p className="page-quiet">Please keep the name to 40 characters or fewer.</p>
          )}
          <p className="settings-note">Time zone: {zone}</p>
          <p className="settings-note">Bills in this household follow this time zone.</p>
          {createError && (
            <p role="alert" className="save-error">
              {createError}
            </p>
          )}
          <button
            type="submit"
            className="sheet-done"
            disabled={createBusy || !hhName.trim() || hhName.trim().length > 40}
          >
            Create
          </button>
        </form>
      </Sheet>

      <Sheet open={nameOpen} onClose={() => setNameOpen(false)} title="Your name">
        <form onSubmit={(e) => void saveName(e)}>
          <label className="field">
            <input
              className="field-input"
              type="text"
              aria-label="Your name"
              autoComplete="given-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          {name !== '' && problem && <p className="page-quiet">{problem}</p>}
          {nameError && (
            <p role="alert" className="save-error">
              {nameError}
            </p>
          )}
          <button type="submit" className="sheet-done" disabled={nameBusy || !!problem || trimmed === (p.display_name ?? '')}>
            Save
          </button>
        </form>
      </Sheet>
    </main>
  );
}
