import React, { useState } from 'react';
import { MessageSquarePlus, CheckCircle2, Loader2, Paperclip } from 'lucide-react';
import { apiFetch } from '../services/api';
import { useApp } from '../context/AppContext';

const CATEGORIES = [
  'General Feedback',
  'Bug Report',
  'Feature Request',
  'Search Quality',
  'AI Assistant Accuracy',
  'Billing & Subscriptions',
  'Account & Security',
];

export const FeedbackPage: React.FC = () => {
  const { user, addToast } = useApp();
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [attachmentName, setAttachmentName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [confirmation, setConfirmation] = useState<{
    referenceNumber: string;
    emailDispatchStatus: string;
    submittedAt: string;
  } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await apiFetch<{
        referenceNumber: string;
        emailDispatchStatus: string;
        submittedAt: string;
      }>('/api/feedback', {
        method: 'POST',
        body: JSON.stringify({
          fullName,
          email,
          category,
          subject,
          message,
          attachmentName: attachmentName || undefined,
        }),
      });
      setConfirmation(res);
      addToast(`Feedback submitted (${res.referenceNumber}).`, 'success');
    } catch (err: any) {
      addToast(err.message || 'Could not submit feedback.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 space-y-8">
      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#258BFF] dark:text-[#B7F34A]">
          <MessageSquarePlus className="w-4 h-4" /> 2MR Feedback Portal
        </div>
        <h1 className="text-3xl font-extrabold text-[#071426] dark:text-white">Give Feedback</h1>
        <p className="text-sm text-slate-600 dark:text-[#8793A5]">
          Help improve 2MR – To Master Research. Every submission is saved with a tracking reference number and routed directly to the 2MR administration team.
        </p>
      </div>

      {confirmation ? (
        <div className="p-8 rounded-2xl border border-[#258BFF]/40 bg-white dark:bg-[#10243D] text-center space-y-4">
          <CheckCircle2 className="w-12 h-12 text-[#B7F34A] mx-auto" />
          <h2 className="text-2xl font-bold text-[#071426] dark:text-white">Thank You for Your Feedback</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Your feedback has been recorded in our system and queued for our team.
          </p>
          <div className="inline-block px-5 py-3 rounded-xl bg-slate-50 dark:bg-[#071426] border border-slate-200 dark:border-slate-700 font-mono text-sm">
            Reference Number:{' '}
            <strong className="text-[#258BFF] dark:text-[#B7F34A]">{confirmation.referenceNumber}</strong>
          </div>
          <p className="text-xs text-[#8793A5]">
            Notification delivery status:{' '}
            <span className="font-mono">{confirmation.emailDispatchStatus}</span>
          </p>
          <div>
            <button
              type="button"
              onClick={() => {
                setConfirmation(null);
                setSubject('');
                setMessage('');
                setAttachmentName('');
              }}
              className="px-5 py-2.5 rounded-xl bg-[#258BFF] text-white text-xs font-semibold"
            >
              Submit Additional Feedback
            </button>
          </div>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="p-6 sm:p-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-5"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                Full Name (Optional)
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your name"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                Email Address *
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                Feedback Category *
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-sm"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                Subject *
              </label>
              <input
                type="text"
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Short summary of your feedback"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
              Detailed Message *
            </label>
            <textarea
              required
              minLength={10}
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe your observation, suggestion, or issue in detail (at least 10 characters)..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
              Optional Screenshot / Attachment Reference
            </label>
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs cursor-pointer hover:border-[#258BFF]">
                <Paperclip className="w-3.5 h-3.5" />
                <span>{attachmentName || 'Select file (optional)'}</span>
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => setAttachmentName(e.target.files?.[0]?.name || '')}
                />
              </label>
              {attachmentName && (
                <button
                  type="button"
                  onClick={() => setAttachmentName('')}
                  className="text-xs text-rose-500 hover:underline"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#B7F34A] text-[#071426] text-sm font-bold hover:brightness-95 disabled:opacity-60"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Submit Feedback
          </button>
        </form>
      )}
    </div>
  );
};
