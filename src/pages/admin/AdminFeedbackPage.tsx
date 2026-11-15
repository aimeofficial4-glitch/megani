import React, { useEffect, useState } from 'react';
import { Send } from 'lucide-react';
import { apiFetch } from '../../services/api';
import { useApp } from '../../context/AppContext';
import { AdminLayout } from './AdminLayout';

export const AdminFeedbackPage: React.FC = () => {
  const { addToast } = useApp();
  const [items, setItems] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [selected, setSelected] = useState<any | null>(null);
  const [replyText, setReplyText] = useState('');
  const [notesText, setNotesText] = useState('');

  const loadFeedback = (status = statusFilter) => {
    apiFetch<{ feedback: any[] }>(`/api/admin/feedback?status=${status}`)
      .then((res) => {
        setItems(res.feedback || []);
        if (selected) {
          const updated = (res.feedback || []).find((f) => f.id === selected.id);
          if (updated) setSelected(updated);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadFeedback(statusFilter);
  }, [statusFilter]);

  const handleStatusUpdate = async (id: string, status: string) => {
    await apiFetch(`/api/admin/feedback/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status, internalNotes: notesText }),
    });
    loadFeedback();
    addToast(`Ticket updated to ${status}.`, 'success');
  };

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !replyText.trim()) return;
    try {
      const res = await apiFetch<{ emailStatus: string }>(`/api/admin/feedback/${selected.id}/reply`, {
        method: 'POST',
        body: JSON.stringify({ replyMessage: replyText.trim() }),
      });
      setReplyText('');
      loadFeedback();
      addToast(`Reply recorded (${res.emailStatus}).`, 'success');
    } catch (err: any) {
      addToast(err.message || 'Reply failed.', 'error');
    }
  };

  return (
    <AdminLayout
      title="Feedback Management Inbox"
      subtitle="Review user feedback submissions, update status, record internal notes, and send replies."
    >
      <div className="flex flex-wrap gap-2">
        {['all', 'new', 'in_review', 'replied', 'resolved', 'archived'].map((st) => (
          <button
            key={st}
            type="button"
            onClick={() => setStatusFilter(st)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize ${
              statusFilter === st
                ? 'bg-[#258BFF] text-white'
                : 'bg-white dark:bg-[#10243D] border border-slate-200 dark:border-slate-800'
            }`}
          >
            {st.replace('_', ' ')}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 space-y-2.5">
          {items.length === 0 ? (
            <div className="p-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] text-center text-xs text-[#8793A5]">
              No feedback tickets in this status.
            </div>
          ) : (
            items.map((fb) => (
              <button
                key={fb.id}
                type="button"
                onClick={() => {
                  setSelected(fb);
                  setNotesText(fb.internalNotes || '');
                }}
                className={`w-full text-left p-4 rounded-xl border transition space-y-1 ${
                  selected?.id === fb.id
                    ? 'border-[#258BFF] bg-[#258BFF]/10'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D]'
                }`}
              >
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-mono font-bold text-[#258BFF] dark:text-[#B7F34A]">
                    {fb.referenceNumber}
                  </span>
                  <span className="uppercase font-bold text-[#8793A5]">{fb.status}</span>
                </div>
                <div className="font-bold text-sm text-[#071426] dark:text-white truncate">{fb.subject}</div>
                <div className="text-xs text-[#8793A5] truncate">
                  {fb.category} · {fb.email}
                </div>
              </button>
            ))
          )}
        </div>

        <div className="lg:col-span-7">
          {!selected ? (
            <div className="p-12 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] text-center text-xs text-[#8793A5]">
              Select a feedback submission on the left to inspect and reply.
            </div>
          ) : (
            <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
                <div>
                  <div className="font-mono text-xs font-bold text-[#258BFF]">{selected.referenceNumber}</div>
                  <h2 className="text-xl font-bold text-[#071426] dark:text-white">{selected.subject}</h2>
                  <p className="text-xs text-[#8793A5]">
                    From: {selected.fullName || 'Visitor'} ({selected.email}) · {selected.category}
                  </p>
                </div>
                <select
                  value={selected.status}
                  onChange={(e) => handleStatusUpdate(selected.id, e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-xs font-semibold"
                >
                  <option value="new">New</option>
                  <option value="in_review">In Review</option>
                  <option value="replied">Replied</option>
                  <option value="resolved">Resolved</option>
                  <option value="archived">Archived</option>
                </select>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#071426] border border-slate-200 dark:border-slate-800 text-sm whitespace-pre-line">
                {selected.message}
              </div>

              {selected.adminReply && (
                <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50 text-xs space-y-1">
                  <div className="font-bold text-emerald-700 dark:text-[#B7F34A]">Sent Reply</div>
                  <p>{selected.adminReply}</p>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-xs font-bold text-[#8793A5]">Internal Admin Notes</label>
                <div className="flex gap-2">
                  <input
                    value={notesText}
                    onChange={(e) => setNotesText(e.target.value)}
                    placeholder="Private triage notes..."
                    className="flex-1 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => handleStatusUpdate(selected.id, selected.status)}
                    className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold"
                  >
                    Save Notes
                  </button>
                </div>
              </div>

              <form onSubmit={handleReply} className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <label className="text-xs font-bold text-[#071426] dark:text-white">
                  Reply to {selected.email}
                </label>
                <textarea
                  rows={3}
                  required
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Write an official response..."
                  className="w-full p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-sm"
                />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#B7F34A] text-[#071426] text-xs font-bold"
                >
                  <Send className="w-3.5 h-3.5" /> Send Reply
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
};
