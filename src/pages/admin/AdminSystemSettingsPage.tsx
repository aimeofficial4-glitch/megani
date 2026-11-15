import React, { useEffect, useState } from 'react';
import { Save, Settings } from 'lucide-react';
import { AdminLayout } from './AdminLayout';
import { apiFetch } from '../../services/api';
import { useApp } from '../../context/AppContext';

export const AdminSystemSettingsPage: React.FC = () => {
  const { addToast } = useApp();
  const [settings, setSettings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [settingKey, setSettingKey] = useState('');
  const [category, setCategory] = useState('general');
  const [settingValueJson, setSettingValueJson] = useState('{"enabled": true}');
  const [saving, setSaving] = useState(false);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ settings: any[] }>('/api/admin/settings/system');
      setSettings(res.settings || []);
    } catch (err: any) {
      addToast(err.message || 'Failed to load system settings.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settingKey.trim()) {
      addToast('Setting key is required.', 'warning');
      return;
    }
    let parsedValue: any = settingValueJson;
    try {
      parsedValue = JSON.parse(settingValueJson);
    } catch {
      parsedValue = { value: settingValueJson };
    }
    setSaving(true);
    try {
      await apiFetch('/api/admin/settings/system', {
        method: 'PATCH',
        body: JSON.stringify({ settingKey: settingKey.trim(), category, settingValue: parsedValue }),
      });
      addToast(`Saved setting "${settingKey.trim()}".`, 'success');
      await loadSettings();
    } catch (err: any) {
      addToast(err.message || 'Failed to save system setting.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const selectSettingForEdit = (row: any) => {
    setSettingKey(row.settingKey);
    setCategory(row.category || 'general');
    setSettingValueJson(JSON.stringify(row.settingValue, null, 2));
  };

  return (
    <AdminLayout
      title="System & Platform Settings"
      subtitle="Manage persistent 2MR runtime configuration flags, search limits, and compliance parameters."
    >
      <div className="space-y-6">
        <form
          onSubmit={handleSave}
          className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-4 text-xs"
        >
          <h2 className="font-bold text-sm text-[#071426] dark:text-white flex items-center gap-2">
            <Settings className="w-4 h-4 text-[#258BFF]" /> Upsert Platform Setting
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[#8793A5] mb-1">Setting Key</label>
              <input
                type="text"
                value={settingKey}
                onChange={(e) => setSettingKey(e.target.value)}
                placeholder="e.g. search_verification_mode"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] font-mono"
              />
            </div>
            <div>
              <label className="block text-[#8793A5] mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
              >
                <option value="general">General</option>
                <option value="search">Search &amp; Sources</option>
                <option value="ai">Unified AI</option>
                <option value="security">Security</option>
                <option value="billing">Billing &amp; Quotas</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[#8793A5] mb-1">JSON Value</label>
            <textarea
              rows={4}
              value={settingValueJson}
              onChange={(e) => setSettingValueJson(e.target.value)}
              className="w-full p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] font-mono text-[11px]"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#B7F34A] text-[#071426] font-bold disabled:opacity-50"
          >
            <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Setting'}
          </button>
        </form>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
            <h2 className="font-bold text-sm text-[#071426] dark:text-white">
              Stored Platform Settings ({settings.length})
            </h2>
          </div>
          {loading ? (
            <div className="p-8 text-center text-xs text-[#8793A5]">Loading platform settings...</div>
          ) : settings.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#8793A5]">
              No custom platform settings stored yet. Use the form above to add one.
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
              {settings.map((row) => (
                <div key={row.id} className="p-4 flex items-start justify-between gap-4">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-[#071426] dark:text-white">{row.settingKey}</span>
                      <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-[#071426] text-[10px] uppercase text-[#8793A5]">
                        {row.category}
                      </span>
                    </div>
                    <pre className="text-[11px] text-slate-600 dark:text-slate-300 font-mono overflow-x-auto">
                      {JSON.stringify(row.settingValue)}
                    </pre>
                    {row.updatedBy && <p className="text-[10px] text-[#8793A5]">Updated by {row.updatedBy}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => selectSettingForEdit(row)}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 font-semibold hover:border-[#258BFF] shrink-0"
                  >
                    Edit
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
};
