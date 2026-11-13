import { useUnreadMessageCount } from '@/hooks/data/useMessages';
import { useUnreadNotificationCount } from '@/hooks/data/useNotifications';

/** Unread counts shown next to "Messages" and "Notifications" in the menus. */
export function useNavBadges() {
  const messages = useUnreadMessageCount().data ?? 0;
  const notifications = useUnreadNotificationCount().data ?? 0;
  return {
    messages,
    notifications,
    /** Badge for a menu link, by its address. */
    forHref: (href: string) => (href.endsWith('/messages') ? messages : href.endsWith('/notifications') ? notifications : 0),
  };
}
