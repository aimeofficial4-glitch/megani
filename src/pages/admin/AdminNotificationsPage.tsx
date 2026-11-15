import React, { useEffect, useState } from 'react';
import { Bell, Send } from 'lucide-react';
import { AdminLayout } from './AdminLayout';
import { apiFetch } from '../../services/api';
import { useApp } from '../../context/AppContext';

export const AdminNotificationsPage: React.FC = () => {
  const { addToast } = useApp();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState('system');
  const [targetRole, setTargetRole] = useState('all');
  const [sending, setSending] = useState(false);

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ notifications: any[] }>('/api/admin/notifications');
      setNotifications(res.notifications || []);
    } catch (err: any) {
      addToast(err.message || 'Failed to load notifications.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, []);

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) {
      addToast('Title and message are required.', 'warning');
      return;
    }
    setSending(true);
    try {
      const res = await apiFetch<{ success: boolean; sentCount: number }>('/api/admin/notifications/broadcast', {
        method: 'POST',
        body: JSON.stringify({ title, message, category, targetRole }),
      });
      setTitle('');
      setMessage('');
      addToast(`Notification delivered to ${res.sentCount} user(s).`, 'success');
      await loadNotifications();
    } catch (err: any) {
      addToast(err.message || 'Failed to send broadcast.', 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <AdminLayout
      title="Platform Notifications & Broadcasts"
      subtitle="Send targeted platform announcements, maintenance notices, or security alerts to 2MR users."
    >
      <div className="space-y-6">
        <form
          onSubmit={handleBroadcast}
          className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-4"
        >
          <h2 className="font-bold text-sm text-[#071426] dark:text-white flex items-center gap-2">
            <Send className="w-4 h-4 text-[#258BFF] dark:text-[#B7F34A]" /> Broadcast Notification
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="sm:col-span-1">
              <label className="block text-[#8793A5] mb-1">Target Audience</label>
              <select
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
              >
                <option value="all">All Registered Accounts</option>
                <option value="free">Free Tier Users</option>
                <option value="premium">Premium Researchers</option>
                <option value="admin">Administrators Only</option>
              </select>
            </div>
            <div className="sm:col-span-1">
              <label className="block text-[#8793A5] mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
              >
                <option value="system">System Update</option>
                <option value="research">Research Intelligence</option>
                <option value="security">Security Advisory</option>
                <option value="billing">Billing &amp; Plans</option>
              </select>
            </div>
            <div className="sm:col-span-1">
              <label className="block text-[#8793A5] mb-1">Headline</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. New YouTube Video Intelligence Live"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
              />
            </div>
          </div>
          <div className="text-xs">
            <label className="block text-[#8793A5] mb-1">Message Body</label>
            <textarea
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Write a clear announcement for your selected user segment..."
              className="w-full p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
            />
          </div>
          <button
            type="submit"
            disabled={sending}
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#258BFF] text-white text-xs font-bold disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" /> {sending ? 'Sending...' : 'Send Broadcast'}
          </button>
        </form>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
            <Bell className="w-4 h-4 text-[#258BFF]" />
            <h2 className="font-bold text-sm text-[#071426] dark:text-white">
              Recent Dispatched Notifications ({notifications.length})
            </h2>
          </div>

          {loading ? (
            <div className="p-8 text-center text-xs text-[#8793A5]">Loading notifications...</div>
          ) : notifications.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#8793A5]">No notifications dispatched yet.</div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {notifications.map((n) => (
                <div key={n.id} className="p-4 flex items-start justify-between gap-4 text-xs">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[#071426] dark:text-white">{n.title}</span>
                      <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-[#071426] text-[10px] uppercase font-semibold text-[#8793A5]">
                        {n.category}
                      </span>
                    </div>
                    <p className="text-slate-600 dark:text-slate-300">{n.message}</p>
                    <p className="text-[11px] text-[#8793A5]">Recipient: {n.userEmail || n.userId}</p>
                  </div>
                  <span className="text-[11px] text-[#8793A5] whitespace-nowrap tabular-nums">
                    {n.createdAt ? new Date(n.createdAt).toLocaleString() : '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
};
