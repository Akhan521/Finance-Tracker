import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export function useSession(): { session: Session | null; loading: boolean } {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let eventSeen = false;
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!active) return;
      eventSeen = true;
      setSession(next);
      setLoading(false);
    });
    supabase.auth
      .getSession()
      .then(({ data: { session: initial } }) => {
        if (!active) return;
        if (!eventSeen) setSession(initial);
        setLoading(false);
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return { session, loading };
}
