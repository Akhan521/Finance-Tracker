import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import type { Database } from './database.types';

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type ProfileChanges = Database['public']['Tables']['profiles']['Update'];

// Held in React Query's memory only. Nothing is written to any other cache.
export const keys = {
  profile: (userId: string) => ['profile', userId] as const,
  household: (userId: string) => ['household', userId] as const,
  invites: (userId: string) => ['invites', userId] as const,
};

export function useProfile(userId: string) {
  return useQuery({
    queryKey: keys.profile(userId),
    queryFn: async (): Promise<Profile> => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdateProfile(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (changes: ProfileChanges) => {
      const { error } = await supabase.from('profiles').update(changes).eq('id', userId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.profile(userId) }),
  });
}

// The person's household, or null if they have none.
export function useMyHousehold(userId: string) {
  return useQuery({
    queryKey: keys.household(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('memberships')
        .select('role, households(id, name, time_zone, retention_months)')
        .eq('profile_id', userId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useMyInvites(userId: string) {
  return useQuery({
    queryKey: keys.invites(userId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_invites');
      if (error) throw error;
      return data;
    },
  });
}

export function useAcceptInvite(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (inviteId: string) => {
      const { data, error } = await supabase.rpc('accept_invite', { p_invite: inviteId });
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: keys.household(userId) }),
        qc.invalidateQueries({ queryKey: keys.invites(userId) }),
      ]);
    },
  });
}
