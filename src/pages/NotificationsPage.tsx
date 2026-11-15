import React from 'react';
import { Bell, CheckCheck, Trash2 } from 'lucide-react';
import { apiFetch } from '../services/api';
import { useApp } from '../context/AppContext';

export const NotificationsPage: React.FC = () => {
  const { notifications, refreshNotifications } = useApp();

  const markRead = async (id: string) => {
    await apiFetch(`/api/notifications/${id}/read`, { method: 'PATCH' });
    refreshNotifications();
  };

  const markAllRead = async () => {
    await apiFetch('/api/notifications/read-all', { method: 'POST' });
    refreshNotifications();
  };

  const deleteNotification = async (id: string) => {
    await apiFetch(`/api/notifications/${id}`, { method: 'DELETE' });
    refreshNotifications();
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-[#071426] dark:text-white">Notifications</h1>
          <p className="text-xs text-[#8793A5]">Research updates, account security alerts, and subscription notices.</p>
        </div>
        {notifications.length > 0 && (
          <button
            type="button"
            onClick={markAllRead}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:border-[#258BFF]"
          >
            <CheckCheck className="w-4 h-4" /> Mark All Read
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="p-12 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] text-center space-y-2">
          <Bell className="w-8 h-8 text-[#8793A5] mx-auto" />
          <p className="font-bold text-sm text-[#071426] dark:text-white">All caught up</p>
          <p className="text-xs text-[#8793A5]">No notifications right now.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`p-5 rounded-xl border transition flex items-start justify-between gap-4 ${
                n.isRead
                  ? 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D]'
                  : 'border-[#258BFF] bg-[#258BFF]/5 dark:bg-[#10243D]'
              }`}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-bold uppercase text-[#258BFF] dark:text-[#B7F34A]">{n.category}</span>
                  <span>·</span>
                  <span className="text-[#8793A5]">{new Date(n.createdAt).toLocaleString()}</span>
                </div>
                <h2 className="font-bold text-sm text-[#071426] dark:text-white">{n.title}</h2>
                <p className="text-xs text-slate-600 dark:text-slate-300">{n.message}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0 text-xs">
                {!n.isRead && (
                  <button
                    type="button"
                    onClick={() => markRead(n.id)}
                    className="px-2.5 py-1 rounded-lg bg-[#258BFF] text-white font-semibold"
                  >
                    Mark Read
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => deleteNotification(n.id)}
                  className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
