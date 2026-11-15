import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Save, ArrowLeft } from 'lucide-react';
import { apiFetch } from '../services/api';
import { useApp } from '../context/AppContext';

export const ProfilePage: React.FC = () => {
  const { user, refreshUser, addToast } = useApp();
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [organization, setOrganization] = useState(user?.organization || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '');
  const [saving, setSaving] = useState(false);

  if (!user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/api/user/profile', {
        method: 'PATCH',
        body: JSON.stringify({ fullName, organization, avatarUrl }),
      });
      await refreshUser();
      addToast('Profile updated.', 'success');
    } catch (err: any) {
      addToast(err.message || 'Update failed.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-6">
      <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#258BFF] hover:underline">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
      </Link>
      <h1 className="text-3xl font-extrabold text-[#071426] dark:text-white">Profile Settings</h1>

      <form
        onSubmit={handleSubmit}
        className="p-6 sm:p-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-5"
      >
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
            Full Name
          </label>
          <input
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
            Email (Read-Only)
          </label>
          <input
            type="email"
            disabled
            value={user.email}
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-[#071426]/60 text-sm text-[#8793A5]"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
            Organization / University
          </label>
          <input
            type="text"
            value={organization}
            onChange={(e) => setOrganization(e.target.value)}
            placeholder="e.g. University of Rwanda"
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
            Avatar Image URL (Optional)
          </label>
          <input
            type="text"
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            placeholder="https://..."
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#258BFF] text-white text-sm font-semibold"
        >
          <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Profile'}
        </button>
      </form>
    </div>
  );
};
