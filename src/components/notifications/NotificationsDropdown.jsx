import { useEffect, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { fetchNotifications, markNotificationRead, markAllNotificationsRead } from '../../lib/api';
import { Btn } from '../ui';
import { cn } from '../../lib/utils';

const NOTIFICATIONS_LIMIT = 10;
/** ~4 notification rows visible before scrolling */
const NOTIFICATIONS_VIEWPORT_CLASS = 'max-h-[17.5rem]';

function formatWhen(iso) {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function NotificationsDropdown({ onOpenTeam }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const load = async () => {
    const data = await fetchNotifications(NOTIFICATIONS_LIMIT);
    setNotifications(data.notifications || []);
    setUnreadCount(data.unreadCount || 0);
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, []);

  const markRead = async (id) => {
    await markNotificationRead(id);
    await load();
  };

  const markAll = async () => {
    await markAllNotificationsRead();
    await load();
  };

  return (
    <div className="relative">
      <Btn variant="ghost" size="sm" onClick={() => setOpen(!open)} className="relative">
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </Btn>

      {open && (
        <>
          <button type="button" className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-label="Close" />
          <div className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-2rem)] z-50 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 dark:border-slate-800">
              <p className="text-sm font-semibold">
                Group notifications
                {notifications.length > 0 && (
                  <span className="text-xs font-normal text-slate-400 ml-1">
                    (last {Math.min(notifications.length, NOTIFICATIONS_LIMIT)})
                  </span>
                )}
              </p>
              {unreadCount > 0 && (
                <button type="button" onClick={markAll} className="text-xs text-indigo-600 hover:underline flex items-center gap-1">
                  <CheckCheck className="w-3.5 h-3.5" /> Mark all read
                </button>
              )}
            </div>
            <div className={cn('overflow-y-auto overscroll-contain', NOTIFICATIONS_VIEWPORT_CLASS)}>
              {notifications.length === 0 ? (
                <p className="text-sm text-slate-500 p-4 text-center">No notifications</p>
              ) : (
                notifications.map((n) => (
                  <button
                    key={n._id}
                    type="button"
                    onClick={() => {
                      if (!n.read) markRead(n._id);
                      if (n.type === 'join_request' && onOpenTeam) {
                        setOpen(false);
                        onOpenTeam();
                      }
                    }}
                    className={cn(
                      'w-full text-left px-3 py-2.5 border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/50',
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
                ))
              )}
            </div>
            {notifications.length >= NOTIFICATIONS_LIMIT && (
              <p className="text-[10px] text-slate-400 text-center py-1.5 border-t border-slate-100 dark:border-slate-800">
                Showing latest {NOTIFICATIONS_LIMIT} · scroll for older
              </p>
            )}
            {onOpenTeam && (
              <div className="p-2 border-t border-slate-100 dark:border-slate-800">
                <Btn size="sm" variant="ghost" className="w-full" onClick={() => { setOpen(false); onOpenTeam(); }}>
                  Open Team tab
                </Btn>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
