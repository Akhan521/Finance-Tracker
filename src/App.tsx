import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router';
import NameStep from './auth/NameStep';
import SignIn from './auth/SignIn';
import { useSession } from './auth/useSession';
import { errorMessage } from './lib/errors';
import { supabase } from './lib/supabase';
import { useMyHousehold, useMyInvites, useProfile } from './lib/queries';
import EditBill from './bills/EditBill';
import NewBill from './bills/NewBill';
import Home from './home/Home';
import { Placeholder } from './Pages';
import ArchivedBills from './settings/ArchivedBills';
import InviteBanner from './settings/InviteBanner';
import OfflineBanner from './ui/OfflineBanner';

const dismissedKey = (userId: string) => `invite-dismissed:${userId}`;

function wasDismissed(userId: string): boolean {
  try {
    return sessionStorage.getItem(dismissedKey(userId)) === '1';
  } catch {
    return false;
  }
}

function Loading() {
  return (
    <p role="status" className="loading">
      Loading…
    </p>
  );
}

// Shown only when a first load failed and there is nothing to show instead.
function LoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <main className="page load-error">
      <p role="alert">{errorMessage(error)}</p>
      <button type="button" className="load-error-retry" onClick={onRetry}>
        Try again
      </button>
      <button type="button" className="signout" onClick={() => void supabase.auth.signOut()}>
        Sign out
      </button>
    </main>
  );
}

// Everything after sign-in: name, then a pending invite, then the app.
function Gate({ userId }: { userId: string }) {
  const profile = useProfile(userId);
  const household = useMyHousehold(userId);
  const invites = useMyInvites(userId);
  const [dismissed, setDismissed] = useState(() => wasDismissed(userId));

  // A failed background refetch keeps its old data, so only a load with
  // nothing to show gets the error screen.
  const failed = (profile.isError && !profile.data ? profile : null) ??
    (household.isError && household.data === undefined ? household : null);
  if (failed) {
    return (
      <LoadError
        error={failed.error}
        onRetry={() => {
          if (profile.isError) void profile.refetch();
          if (household.isError) void household.refetch();
        }}
      />
    );
  }
  if (!profile.data || household.data === undefined) return <Loading />;
  // Invites are optional: if they can't load, carry on as if there are none.
  if (invites.isPending) return <Loading />;
  const pending = invites.data ?? [];

  if (profile.data.display_name === null) return <NameStep userId={userId} />;

  const invite = pending[0];
  if (invite && household.data === null && !dismissed) {
    return (
      <InviteBanner
        userId={userId}
        invite={invite}
        onDismiss={() => {
          try {
            sessionStorage.setItem(dismissedKey(userId), '1');
          } catch {
            // Dismissal then lasts only until the page reloads.
          }
          setDismissed(true);
        }}
      />
    );
  }

  return (
    <Routes>
      <Route path="/" element={<Home userId={userId} />} />
      <Route path="/bills/new" element={<NewBill userId={userId} />} />
      <Route path="/bills/:id" element={<EditBill userId={userId} />} />
      <Route path="/settings" element={<Placeholder title="Settings" />} />
      <Route path="/settings/household" element={<Placeholder title="Household" back="/settings" />} />
      <Route path="/settings/archived" element={<ArchivedBills userId={userId} />} />
      <Route path="/settings/delete-account" element={<Placeholder title="Delete account" back="/settings" />} />
      <Route path="*" element={<Placeholder title="Not found" />} />
    </Routes>
  );
}

export default function App() {
  const { session, loading } = useSession();
  const qc = useQueryClient();
  useEffect(() => {
    // Signed out (here or on another tab): drop everything held in memory.
    if (!loading && !session) qc.clear();
  }, [loading, session, qc]);
  if (loading) return <Loading />;
  return (
    <BrowserRouter>
      <OfflineBanner />
      {session ? <Gate key={session.user.id} userId={session.user.id} /> : <SignIn />}
    </BrowserRouter>
  );
}
