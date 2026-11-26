import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

// The app's one sign-out path. Throws if sign-out fails, and only then leaves
// the cache alone. On success everything held in memory is dropped.
export function useSignOut() {
  const qc = useQueryClient();
  return async (scope: 'local' | 'global' = 'local') => {
    const { error } = scope === 'global' ? await supabase.auth.signOut({ scope }) : await supabase.auth.signOut();
    if (error) throw error;
    qc.clear();
  };
}
