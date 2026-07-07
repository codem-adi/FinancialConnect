import { useEffect, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { fetchNotifications, markNotificationRead, markAllNotificationsRead } from '../../lib/api';
import { Btn } from '../ui';
import { cn } from '../../lib/utils';
import { HeaderDropdownPanel } from '../layout/HeaderDropdownPanel';

const NOTIFICATIONS_LIMIT = 10;

function formatWhen(iso) {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function NotificationsDropdown({ open, onOpenChange, onOpenTeam }) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const load = async () => {
    try {
      const data = await fetchNotifications(NOTIFICATIONS_LIMIT);
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    } catch {
      setNotifications([]);
      setUnreadCount(0);
    }
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open]);

  const markRead = async (id) => {
    await markNotificationRead(id);
    await load();
  };

  const markAll = async () => {
    await markAllNotificationsRead();
    await load();
  };

  return (
    <>
      <Btn
        variant="ghost"
        size="sm"
        onClick={() => onOpenChange(!open)}
        className="relative"
        title="Notifications"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center pointer-events-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </Btn>

      <HeaderDropdownPanel
        open={open}
        onClose={() => onOpenChange(false)}
        title="Notifications"
        titleExtra={notifications.length > 0 ? (
          <span className="text-xs font-normal text-slate-400 ml-1">
            (last {Math.min(notifications.length, NOTIFICATIONS_LIMIT)})
          </span>
        ) : null}
        headerAction={unreadCount > 0 ? (
          <button
            type="button"
            onClick={markAll}
            className="text-xs text-indigo-600 hover:underline flex items-center gap-1 shrink-0"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Mark all read</span>
            <span className="sm:hidden">Read all</span>
          </button>
        ) : null}
        footer={onOpenTeam ? (
          <div className="p-2">
            <Btn size="sm" variant="ghost" className="w-full" onClick={() => { onOpenChange(false); onOpenTeam(); }}>
              Open Team tab
            </Btn>
          </div>
        ) : null}
      >
        {notifications.length === 0 ? (
          <p className="text-sm text-slate-500 p-4 text-center">No notifications</p>
        ) : (
          <>
            {notifications.map((n) => (
              <button
                key={n._id}
                type="button"
                onClick={() => {
                  if (!n.read) markRead(n._id);
                  if (n.type === 'join_request' && onOpenTeam) {
                    onOpenChange(false);
                    onOpenTeam();
                  }
                }}
                className={cn(
                  'w-full text-left px-3 py-2.5 border-b border-slate-50 dark:border-slate-800/50',
                  'hover:bg-slate-50 dark:hover:bg-slate-800/50 active:bg-slate-100 dark:active:bg-slate-800',
                  !n.read && 'bg-indigo-50/50 dark:bg-indigo-900/10',
                  n.type === 'join_request' && 'border-l-2 border-l-amber-400',
                )}
              >
                <p className="text-sm leading-snug">{n.message}</p>
                {n.type === 'join_request' && (
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">Tap to review in Team</p>
                )}
                <p className="text-[10px] text-slate-400 mt-0.5">{formatWhen(n.createdAt)}</p>
              </button>
            ))}
            {notifications.length >= NOTIFICATIONS_LIMIT && (
              <p className="text-[10px] text-slate-400 text-center py-2 px-3">
                Showing latest {NOTIFICATIONS_LIMIT}
              </p>
            )}
          </>
        )}
      </HeaderDropdownPanel>
    </>
  );
}
