import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { NotificationRow } from '@/lib/database.types';

// In-app notifications. The database creates them (see 007_messages_notifications.sql);
// the app only reads them, marks them read and clears old ones.

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}

export function useNotifications(limit = 100) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['notifications', 'list', user?.id, limit],
    enabled: !!user,
    queryFn: async () =>
      unwrap(
        await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(limit),
      ) as NotificationRow[],
  });
}

export function useUnreadNotificationCount() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['notifications', 'unread', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .is('read_at', null);
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    // Fallback in case live updates are blocked (e.g. by a firewall).
    refetchInterval: 60_000,
  });
}

/** Pass ids to mark some as read, or nothing to mark all as read. */
export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids?: string[]) => unwrap(await supabase.rpc('mark_notifications_read', { p_ids: ids ?? null })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

/** Delete notifications that have already been read. */
export function useClearReadNotifications() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async () =>
      unwrap(await supabase.from('notifications').delete().eq('user_id', user!.id).not('read_at', 'is', null)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}
