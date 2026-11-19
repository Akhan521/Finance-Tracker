import { useState } from 'react';
import { Link } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { APP_NAME } from './lib/config';
import { supabase } from './lib/supabase';
import './Pages.css';

// Routes that later tasks build render this calm stand-in.
export function Placeholder({ title, back = '/' }: { title: string; back?: string }) {
  return (
    <main className="page">
      <Link to={back} className="page-back">
        ← Back
      </Link>
      <h1>{title}</h1>
      <p className="page-quiet">This part is coming soon.</p>
    </main>
  );
}

export function Home() {
  const qc = useQueryClient();
  const [message, setMessage] = useState('');
  async function signOut() {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      qc.clear();
    } catch {
      setMessage("Couldn't sign out. Please try again.");
    }
  }
  return (
    <main className="page">
      <header className="topbar">
        <h1>{APP_NAME}</h1>
        <nav className="topbar-actions">
          <Link to="/settings" aria-label="Settings" className="icon-link">
            ⚙
          </Link>
          <Link to="/bills/new" aria-label="Add a bill" className="icon-link">
            +
          </Link>
        </nav>
      </header>
      <section className="empty">
        <p className="empty-line">No bills yet.</p>
        <Link to="/bills/new" className="empty-action">
          Add your first bill
        </Link>
      </section>
      {/* Temporary until Settings (Task 17) has its own sign-out. */}
      <button type="button" className="signout" onClick={() => void signOut()}>
        Sign out
      </button>
      {message && (
        <p role="alert" className="page-quiet signout-message">
          {message}
        </p>
      )}
    </main>
  );
}
