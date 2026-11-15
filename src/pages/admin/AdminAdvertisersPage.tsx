import React, { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { AdminLayout } from './AdminLayout';
import { apiFetch } from '../../services/api';
import { useApp } from '../../context/AppContext';

export const AdminAdvertisersPage: React.FC = () => {
  const { addToast } = useApp();
  const [advertisers, setAdvertisers] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [industry, setIndustry] = useState('Education & Research');

  const loadData = async () => {
    try {
      const res = await apiFetch<{ advertisers: any[] }>('/api/admin/advertisers');
      setAdvertisers(res.advertisers || []);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/admin/advertisers', {
        method: 'POST',
        body: JSON.stringify({ name, contactEmail, website, industry }),
      });
      setName('');
      setContactEmail('');
      setWebsite('');
      addToast('Advertiser partner added.', 'success');
      loadData();
    } catch (err: any) {
      addToast(err.message || 'Failed to add advertiser.', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    await apiFetch(`/api/admin/advertisers/${id}`, { method: 'DELETE' });
    loadData();
  };

  return (
    <AdminLayout title="Advertiser Partners" subtitle="Manage approved educational, institutional, and technology sponsors.">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <form
          onSubmit={handleCreate}
          className="lg:col-span-4 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-3 h-fit"
        >
          <h2 className="font-bold text-sm text-[#071426] dark:text-white">Register Advertiser</h2>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Organization Name *"
            className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-xs"
          />
          <input
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="Contact Email"
            className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-xs"
          />
          <input
            type="url"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://partner.org"
            className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-xs"
          />
          <input
            type="text"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            placeholder="Industry"
            className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-xs"
          />
          <button
            type="submit"
            className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[#B7F34A] text-[#071426] text-xs font-bold"
          >
            <Plus className="w-4 h-4" /> Add Advertiser
          </button>
        </form>

        <div className="lg:col-span-8 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-3">
          <h2 className="font-bold text-sm text-[#071426] dark:text-white">Registered Advertisers ({advertisers.length})</h2>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {advertisers.map((adv) => (
              <div key={adv.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                <div>
                  <div className="font-bold text-[#071426] dark:text-white">{adv.name}</div>
                  <div className="text-[#8793A5]">
                    {adv.industry} {adv.contactEmail ? `· ${adv.contactEmail}` : ''} {adv.website ? `· ${adv.website}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(adv.id)}
                  className="text-rose-500 p-1 hover:bg-rose-500/10 rounded"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};
