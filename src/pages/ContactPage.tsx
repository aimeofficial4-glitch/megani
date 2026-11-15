import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Phone, Send, CheckCircle2 } from 'lucide-react';
import { apiFetch } from '../services/api';
import { useApp } from '../context/AppContext';
import { YouTubeBadgeLink } from '../components/common/YouTubeBadgeLink';

export const ContactPage: React.FC = () => {
  const { addToast } = useApp();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    try {
      await apiFetch('/api/contact', {
        method: 'POST',
        body: JSON.stringify({ name, email, subject, message }),
      });
      setSent(true);
      addToast('Message received by 2MR Support.', 'success');
    } catch (err: any) {
      addToast(err.message || 'Unable to send message.', 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 grid grid-cols-1 md:grid-cols-12 gap-8">
      <div className="md:col-span-5 space-y-5">
        <span className="text-xs font-bold uppercase tracking-wider text-[#258BFF] dark:text-[#B7F34A]">
          Contact 2MR
        </span>
        <h1 className="text-3xl font-extrabold text-[#071426] dark:text-white">Get in Touch</h1>
        <p className="text-sm text-slate-600 dark:text-[#8793A5]">
          Reach out for institutional partnerships, billing support, press inquiries, or technical assistance.
        </p>

        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-4 text-sm">
          <div>
            <p className="text-xs font-bold uppercase text-[#8793A5]">Founder & CEO</p>
            <p className="font-bold text-[#071426] dark:text-white">Gihozo Aime</p>
          </div>
          <div className="flex items-center gap-2.5">
            <Mail className="w-4 h-4 text-[#258BFF]" />
            <a href="mailto:2mr@proton.me" className="hover:underline font-medium">
              2mr@proton.me
            </a>
          </div>
          <div className="flex items-center gap-2.5">
            <Phone className="w-4 h-4 text-[#258BFF]" />
            <span className="font-medium">0780558358</span>
          </div>
        </div>

        <YouTubeBadgeLink variant="card" />

        <div className="text-xs text-[#8793A5]">
          Want to submit bug reports or feature requests with a tracking number?{' '}
          <Link to="/feedback" className="text-[#258BFF] font-semibold hover:underline">
            Use the 2MR Feedback Form →
          </Link>
        </div>
      </div>

      <div className="md:col-span-7 p-6 sm:p-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D]">
        {sent ? (
          <div className="py-12 text-center space-y-3">
            <CheckCircle2 className="w-10 h-10 text-[#B7F34A] mx-auto" />
            <h2 className="text-xl font-bold text-[#071426] dark:text-white">Support Message Sent</h2>
            <p className="text-sm text-[#8793A5]">
              Our team will review your inquiry and reply via email.
            </p>
            <button
              type="button"
              onClick={() => {
                setSent(false);
                setSubject('');
                setMessage('');
              }}
              className="px-4 py-2 rounded-xl bg-[#258BFF] text-white text-xs font-semibold"
            >
              Send Another Message
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <h2 className="text-lg font-bold text-[#071426] dark:text-white">Send a Direct Message</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your Name"
                className="px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-sm"
              />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Your Email"
                className="px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-sm"
              />
            </div>
            <input
              type="text"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-sm"
            />
            <textarea
              required
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="How can our team help?"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-sm"
            />
            <button
              type="submit"
              disabled={sending}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#258BFF] text-white text-sm font-semibold disabled:opacity-60"
            >
              <Send className="w-4 h-4" /> {sending ? 'Sending...' : 'Send Message'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
