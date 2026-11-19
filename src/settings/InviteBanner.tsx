import { useState } from 'react';
import { errorMessage } from '../lib/errors';
import { useAcceptInvite } from '../lib/queries';
import './InviteBanner.css';

export type Invite = {
  id: string;
  household_name: string;
  invited_by_name: string | null;
  expires_at: string;
};

type Props = { userId: string; invite: Invite; onDismiss: () => void };

export default function InviteBanner({ userId, invite, onDismiss }: Props) {
  const accept = useAcceptInvite(userId);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function onAccept() {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      await accept.mutateAsync(invite.id);
      // The gate re-checks and moves on once the household exists.
    } catch (err) {
      setMessage(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <main className="invite">
      <section className="invite-card">
        <h1>Join {invite.household_name}?</h1>
        <p className="invite-from">{invite.invited_by_name ? `Invited by ${invite.invited_by_name}` : 'Invited by a household member'}</p>
        <button type="button" className="invite-accept" disabled={busy} onClick={() => void onAccept()}>
          Accept
        </button>
        <button type="button" className="invite-later" disabled={busy} onClick={onDismiss}>
          Not now
        </button>
        <p role="alert" className="invite-message">
          {message}
        </p>
      </section>
    </main>
  );
}
