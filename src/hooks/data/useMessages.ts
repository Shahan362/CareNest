import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { MessageRow, OfficeThread } from '@/lib/database.types';

// Messages between a caregiver / patient and the office. Live updates arrive through
// RealtimeSync, which refreshes these queries when a new message is inserted.

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}

/** All messages in one conversation, oldest first. */
export function useThread(threadUserId: string | null | undefined) {
  return useQuery({
    queryKey: ['messages', 'thread', threadUserId],
    enabled: !!threadUserId,
    queryFn: async () =>
      unwrap(
        await supabase
          .from('messages')
          .select('*')
          .eq('thread_user_id', threadUserId!)
          .order('created_at', { ascending: true })
          .limit(1000),
      ) as MessageRow[],
  });
}

export function useSendMessage() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async (a: { threadUserId: string; body: string }) =>
      unwrap(
        await supabase
          .from('messages')
          // Sender, name and side are filled in by the database.
          .insert({ agency_id: profile!.agency_id, thread_user_id: a.threadUserId, body: a.body.trim() })
          .select()
          .single(),
      ) as MessageRow,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['messages'] });
    },
  });
}

export function useMarkThreadRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (threadUserId: string) => unwrap(await supabase.rpc('mark_thread_read', { p_thread_user_id: threadUserId })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['messages', 'unread'] });
      qc.invalidateQueries({ queryKey: ['messages', 'threads'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

/** Office inbox: one row per conversation. */
export function useOfficeThreads() {
  return useQuery({
    queryKey: ['messages', 'threads'],
    queryFn: async () => unwrap(await supabase.rpc('office_threads')) as OfficeThread[],
  });
}

/** Unread messages for the signed-in user (from the other side of their conversations). */
export function useUnreadMessageCount() {
  const { profile } = useAuth();
  const isOffice = profile?.role === 'admin';
  return useQuery({
    queryKey: ['messages', 'unread', profile?.id],
    enabled: !!profile,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .is('read_at', null)
        .eq('from_office', !isOffice);
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    // Fallback in case live updates are blocked (e.g. by a firewall).
    refetchInterval: 60_000,
  });
}

/** People the office can message: caregivers and patients in the agency who have an app login. */
export function useMessageContacts() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['messages', 'contacts', profile?.agency_id],
    enabled: profile?.role === 'admin',
    queryFn: async () =>
      unwrap(
        await supabase
          .from('profiles')
          .select('id, role, first_name, last_name, email')
          .eq('agency_id', profile!.agency_id)
          .in('role', ['caregiver', 'patient'])
          .order('first_name'),
      ) as { id: string; role: 'caregiver' | 'patient'; first_name: string | null; last_name: string | null; email: string }[],
  });
}
