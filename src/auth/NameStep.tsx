import { useState, type FormEvent } from 'react';
import { APP_NAME } from '../lib/config';
import { errorMessage } from '../lib/errors';
import { useUpdateProfile } from '../lib/queries';
import './NameStep.css';

export default function NameStep({ userId }: { userId: string }) {
  const update = useUpdateProfile(userId);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setMessage('Please enter your name.');
      return;
    }
    if (trimmed.length > 40) {
      setMessage('Please keep your name to 40 characters or fewer.');
      return;
    }
    setMessage('');
    setBusy(true);
    try {
      await update.mutateAsync({ display_name: trimmed });
      // On success the gate sees the saved name and moves on.
    } catch (err) {
      setMessage(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <main className="namestep">
      <h1>Welcome to {APP_NAME}</h1>
      <form onSubmit={onSubmit} className="namestep-card">
        <p className="namestep-hint">What should we call you? Your name shows next to payments you mark as paid.</p>
        <label htmlFor="display-name">Your name</label>
        <input
          id="display-name"
          type="text"
          autoComplete="given-name"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" disabled={busy}>
          Continue
        </button>
        <p role="alert" className="namestep-message">
          {message}
        </p>
      </form>
    </main>
  );
}
