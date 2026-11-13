import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { NotificationRow } from '@/lib/database.types';

/**
 * Listens to Supabase Realtime while someone is logged in:
 * - a new notification refreshes the open screens and shows a pop-up
 * - a new message refreshes the conversation and unread counts
 * Row Level Security applies, so each user only receives their own rows.
 */
const RealtimeSync: React.FC = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!user) return;

    const onNotification = (n: NotificationRow, isNew: boolean) => {
      // Something changed (visit, request, invoice...): refresh whatever is on screen.
      qc.invalidateQueries();
      if (!isNew || n.read_at) return;
      // Don't pop up a message alert while the user is already looking at the conversation.
      const target = n.link?.split('?')[0];
      if (n.type === 'message' && target && window.location.pathname === target) return;
      toast(n.group_count > 1 ? `${n.title} (${n.group_count})` : n.title, {
        description: n.body ?? undefined,
        action: n.link ? { label: 'Open', onClick: () => navigate(n.link!) } : undefined,
      });
    };

    const channel = supabase
      .channel(`live-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        (payload) => onNotification(payload.new as NotificationRow, true),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        (payload) => {
          const n = payload.new as NotificationRow;
          // A grouped alert got another item (unread) => treat as new; a "mark read" just refreshes counts.
          onNotification(n, !n.read_at && n.group_count > 1);
        },
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
        qc.invalidateQueries({ queryKey: ['messages'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, qc, navigate]);

  // Fallback if Realtime is unavailable: refresh unread counts when the page changes.
  useEffect(() => {
    if (!user) return;
    qc.invalidateQueries({ queryKey: ['notifications', 'unread'] });
    qc.invalidateQueries({ queryKey: ['messages', 'unread'] });
  }, [location.pathname, user, qc]);

  return null;
};

export default RealtimeSync;
