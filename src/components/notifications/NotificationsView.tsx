import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  CalendarPlus,
  CalendarX,
  CheckCircle2,
  FileText,
  Heart,
  MessageSquare,
  PoundSterling,
  Send,
  UserPlus,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingState } from '@/components/admin/DataState';
import { useClearReadNotifications, useMarkNotificationsRead, useNotifications } from '@/hooks/data/useNotifications';
import type { NotificationRow } from '@/lib/database.types';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

const ICONS: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string }> = {
  visit_assigned: { icon: CalendarPlus, color: 'text-blue-600 bg-blue-50' },
  visit_changed: { icon: CalendarClock, color: 'text-amber-600 bg-amber-50' },
  visit_cancelled: { icon: CalendarX, color: 'text-red-600 bg-red-50' },
  visit_removed: { icon: CalendarX, color: 'text-gray-600 bg-gray-100' },
  carer_changed: { icon: Users, color: 'text-amber-600 bg-amber-50' },
  request: { icon: Send, color: 'text-blue-600 bg-blue-50' },
  request_answered: { icon: Send, color: 'text-green-600 bg-green-50' },
  feedback: { icon: MessageSquare, color: 'text-purple-600 bg-purple-50' },
  feedback_reply: { icon: MessageSquare, color: 'text-green-600 bg-green-50' },
  compliment: { icon: Heart, color: 'text-pink-600 bg-pink-50' },
  concern: { icon: AlertTriangle, color: 'text-amber-700 bg-amber-50' },
  concern_resolved: { icon: CheckCircle2, color: 'text-green-600 bg-green-50' },
  invoice: { icon: FileText, color: 'text-blue-600 bg-blue-50' },
  payment: { icon: PoundSterling, color: 'text-green-600 bg-green-50' },
  signup: { icon: UserPlus, color: 'text-purple-600 bg-purple-50' },
  message: { icon: MessageSquare, color: 'text-primary bg-primary/10' },
};

type Filter = 'all' | 'unread';

/** The notifications list, used by the admin, caregiver and patient Notifications pages. */
const NotificationsView: React.FC<{ explainer: string }> = ({ explainer }) => {
  const navigate = useNavigate();
  const { data = [], isLoading, error, refetch } = useNotifications(200);
  const markRead = useMarkNotificationsRead();
  const clearRead = useClearReadNotifications();
  const [filter, setFilter] = useState<Filter>('all');

  const unread = data.filter((n) => !n.read_at);
  const shown = filter === 'unread' ? unread : data;

  const open = (n: NotificationRow) => {
    if (!n.read_at) markRead.mutate([n.id]);
    if (n.link) navigate(n.link);
  };

  const run = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn();
      toast.success(msg);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex gap-2">
          <Button size="sm" variant={filter === 'all' ? 'default' : 'outline'} onClick={() => setFilter('all')}>All</Button>
          <Button size="sm" variant={filter === 'unread' ? 'default' : 'outline'} onClick={() => setFilter('unread')}>
            Unread{unread.length > 0 && ` (${unread.length})`}
          </Button>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={unread.length === 0 || markRead.isPending} onClick={() => run(() => markRead.mutateAsync(undefined), 'All marked as read')}>
            Mark all as read
          </Button>
          <Button size="sm" variant="ghost" disabled={data.length === unread.length || clearRead.isPending} onClick={() => run(() => clearRead.mutateAsync(), 'Read notifications cleared')}>
            Clear read
          </Button>
        </div>
      </div>

      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <div className="bg-white rounded-lg border"><ErrorState error={error} onRetry={refetch} /></div>
      ) : shown.length === 0 ? (
        <div className="bg-white rounded-lg border">
          <EmptyState title={filter === 'unread' ? 'You are all caught up' : 'No notifications yet'} description={explainer} />
        </div>
      ) : (
        <ul className="bg-white rounded-lg border divide-y">
          {shown.map((n) => {
            const meta = ICONS[n.type] ?? { icon: Bell, color: 'text-gray-600 bg-gray-100' };
            const Icon = meta.icon;
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => open(n)}
                  className={cn('w-full text-left flex items-start gap-3 p-3 sm:p-4 hover:bg-gray-50', !n.read_at && 'bg-blue-50/40')}
                >
                  <span className={cn('flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center', meta.color)}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className={cn('block text-sm', !n.read_at ? 'font-semibold' : 'font-medium text-gray-800')}>
                      {n.title}
                      {n.group_count > 1 && <span className="ml-1 text-xs font-medium text-gray-500">×{n.group_count}</span>}
                    </span>
                    {n.body && <span className="block text-sm text-gray-600 line-clamp-2">{n.body}</span>}
                    <span className="block text-xs text-gray-400 mt-0.5" title={formatDateTime(n.created_at)}>
                      {formatDistanceToNow(parseISO(n.created_at), { addSuffix: true })}
                    </span>
                  </span>
                  {!n.read_at && <span className="mt-2 w-2 h-2 rounded-full bg-primary flex-shrink-0" aria-label="Unread" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default NotificationsView;
