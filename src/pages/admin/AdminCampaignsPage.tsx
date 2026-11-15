import React, { useEffect, useState } from 'react';
import { Plus, ShieldCheck } from 'lucide-react';
import { AdminLayout } from './AdminLayout';
import { apiFetch } from '../../services/api';
import { useApp } from '../../context/AppContext';

export const AdminCampaignsPage: React.FC = () => {
  const { addToast } = useApp();
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [placements, setPlacements] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [budgetUsd, setBudgetUsd] = useState(500);
  const [dailyCap, setDailyCap] = useState(1000);
  const [frequencyCap, setFrequencyCap] = useState(5);

  const loadData = async () => {
    try {
      const res = await apiFetch<{ campaigns: any[]; placements: any[] }>('/api/admin/campaigns');
      setCampaigns(res.campaigns || []);
      setPlacements(res.placements || []);
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
      await apiFetch('/api/admin/campaigns', {
        method: 'POST',
        body: JSON.stringify({
          name,
          budgetUsd,
          dailyCap,
          frequencyCapPerUser: frequencyCap,
        }),
      });
      setName('');
      addToast('Advertisement campaign created.', 'success');
      loadData();
    } catch (err: any) {
      addToast(err.message || 'Failed to create campaign.', 'error');
    }
  };

  const toggleCampaign = async (id: string, status: string) => {
    await apiFetch(`/api/admin/campaigns/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    loadData();
  };

  const togglePlacement = async (id: string, isEnabled: boolean) => {
    await apiFetch(`/api/admin/placements/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isEnabled }),
    });
    loadData();
  };

  return (
    <AdminLayout
      title="Campaigns & Placement Rules"
      subtitle="Control campaign budgets, impression/frequency caps, and placement policies across Free accounts."
    >
      <div className="space-y-6">
        <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-[#10243D] flex items-center gap-3 text-xs text-slate-700 dark:text-slate-200">
          <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-[#B7F34A] shrink-0" />
          <span>
            2MR Policy Enforced: Standard ads never display to Premium or Admin accounts, and video ads are strictly blocked on third-party YouTube players.
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleCreate}
            className="lg:col-span-4 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-3 h-fit text-xs"
          >
            <h2 className="font-bold text-sm text-[#071426] dark:text-white">New Campaign</h2>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Campaign Name *"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
            />
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[#8793A5]">Budget ($)</label>
                <input
                  type="number"
                  value={budgetUsd}
                  onChange={(e) => setBudgetUsd(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] tabular-nums"
                />
              </div>
              <div>
                <label className="text-[#8793A5]">Daily Cap</label>
                <input
                  type="number"
                  value={dailyCap}
                  onChange={(e) => setDailyCap(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] tabular-nums"
                />
              </div>
              <div>
                <label className="text-[#8793A5]">Freq / User</label>
                <input
                  type="number"
                  value={frequencyCap}
                  onChange={(e) => setFrequencyCap(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] tabular-nums"
                />
              </div>
            </div>
            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[#B7F34A] text-[#071426] font-bold"
            >
              <Plus className="w-4 h-4" /> Create Campaign
            </button>
          </form>

          <div className="lg:col-span-8 space-y-6">
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-3">
              <h2 className="font-bold text-sm text-[#071426] dark:text-white">Active &amp; Scheduled Campaigns</h2>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {campaigns.length === 0 ? (
                  <p className="text-[#8793A5] py-3">No extended campaigns created yet.</p>
                ) : (
                  campaigns.map((c) => (
                    <div key={c.id} className="py-3 flex items-center justify-between gap-3">
                      <div>
                        <div className="font-bold text-[#071426] dark:text-white">{c.name}</div>
                        <div className="text-[#8793A5] tabular-nums">
                          Budget: ${c.budgetUsd} · Daily Cap: {c.dailyCap} · Freq Cap: {c.frequencyCapPerUser}/user
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleCampaign(c.id, c.status === 'active' ? 'paused' : 'active')}
                        className={`px-3 py-1 rounded-lg font-bold capitalize ${
                          c.status === 'active'
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-[#B7F34A]'
                            : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                        }`}
                      >
                        {c.status}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-3">
              <h2 className="font-bold text-sm text-[#071426] dark:text-white">Placement Slots</h2>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {placements.map((pl) => (
                  <div key={pl.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div>
                      <div className="font-bold text-[#071426] dark:text-white">{pl.name}</div>
                      <div className="text-[#8793A5]">
                        Code: <span className="font-mono">{pl.code}</span> · Third-party video injection:{' '}
                        {pl.allowsThirdPartyVideo ? 'Allowed' : 'Blocked'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => togglePlacement(pl.id, !pl.isEnabled)}
                      className={`px-3 py-1 rounded-lg font-bold ${
                        pl.isEnabled
                          ? 'bg-[#258BFF]/15 text-[#258BFF]'
                          : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                      }`}
                    >
                      {pl.isEnabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};
