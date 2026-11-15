import React, { useEffect, useState } from 'react';
import { CheckCircle2, Cpu, KeyRound, Play, Save, AlertTriangle } from 'lucide-react';
import { AdminLayout } from './AdminLayout';
import { apiFetch } from '../../services/api';
import { useApp } from '../../context/AppContext';

export const AdminAiProvidersPage: React.FC = () => {
  const { addToast } = useApp();
  const [providers, setProviders] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>({
    multiModelVerificationEnabled: true,
    autoFallbackEnabled: true,
    maxProvidersPerDeepQuery: 3,
    timeoutMs: 15000,
    privacyDisclosureText: '',
  });
  const [apiKeyDrafts, setApiKeyDrafts] = useState<Record<string, string>>({});
  const [baseUrlDrafts, setBaseUrlDrafts] = useState<Record<string, string>>({});
  const [testingSlug, setTestingSlug] = useState<string | null>(null);

  const loadProviders = async () => {
    try {
      const res = await apiFetch<{ providers: any[]; settings: any }>('/api/admin/ai-providers');
      setProviders(res.providers || []);
      if (res.settings) setSettings(res.settings);
      const urls: Record<string, string> = {};
      (res.providers || []).forEach((p) => {
        urls[p.slug] = p.baseUrl || '';
      });
      setBaseUrlDrafts(urls);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadProviders();
  }, []);

  const updateProvider = async (slug: string, payload: Record<string, any>) => {
    try {
      await apiFetch(`/api/admin/ai-providers/${slug}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      setApiKeyDrafts((prev) => ({ ...prev, [slug]: '' }));
      addToast(`Updated provider settings for ${slug}.`, 'success');
      loadProviders();
    } catch (err: any) {
      addToast(err.message || 'Update failed.', 'error');
    }
  };

  const testConnection = async (slug: string) => {
    setTestingSlug(slug);
    try {
      const res = await apiFetch<{ ok: boolean; latencyMs: number; message: string }>(
        `/api/admin/ai-providers/${slug}/test`,
        { method: 'POST' }
      );
      addToast(`${slug}: ${res.message} (${res.latencyMs}ms)`, res.ok ? 'success' : 'warning');
      loadProviders();
    } catch (err: any) {
      addToast(err.message || 'Connection test failed.', 'error');
    } finally {
      setTestingSlug(null);
    }
  };

  const saveGlobalSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/admin/ai-settings', {
        method: 'PATCH',
        body: JSON.stringify(settings),
      });
      addToast('Global orchestrator settings saved.', 'success');
    } catch (err: any) {
      addToast(err.message || 'Failed to save settings.', 'error');
    }
  };

  return (
    <AdminLayout
      title="AI Providers & Orchestration"
      subtitle="Configure encrypted official API keys (OpenAI, Google Gemini, Anthropic, Custom), priority routing, fallback rules, and health checks."
    >
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {providers.map((p) => {
            const configured = p.hasDbKey || p.hasEnvKey;
            return (
              <div
                key={p.id}
                className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-[#258BFF] dark:text-[#B7F34A]" />
                      <h2 className="font-bold text-base text-[#071426] dark:text-white">{p.name}</h2>
                    </div>
                    <p className="text-xs text-[#8793A5] mt-0.5">
                      Slug: <span className="font-mono">{p.slug}</span> · Health: {p.healthStatus}
                      {p.apiKeyLast4 ? ` · Key ****${p.apiKeyLast4}` : p.hasEnvKey ? ' · Server Env Active' : ' · Unconfigured'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => updateProvider(p.slug, { isEnabled: !p.isEnabled })}
                      className={`px-3 py-1 rounded-lg font-bold ${
                        p.isEnabled
                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-[#B7F34A]'
                          : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                      }`}
                    >
                      {p.isEnabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-[#8793A5] mb-1">Priority Order</label>
                    <input
                      type="number"
                      defaultValue={p.priority}
                      onBlur={(e) => updateProvider(p.slug, { priority: Number(e.target.value) })}
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-[#8793A5] mb-1">Rate Limit / min</label>
                    <input
                      type="number"
                      defaultValue={p.rateLimitPerMin}
                      onBlur={(e) => updateProvider(p.slug, { rateLimitPerMin: Number(e.target.value) })}
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] tabular-nums"
                    />
                  </div>
                </div>

                {p.slug === 'custom' && (
                  <div className="text-xs">
                    <label className="block text-[#8793A5] mb-1">Custom OpenAI-Compatible Base URL</label>
                    <input
                      type="url"
                      value={baseUrlDrafts[p.slug] || ''}
                      onChange={(e) => setBaseUrlDrafts((prev) => ({ ...prev, [p.slug]: e.target.value }))}
                      placeholder="https://api.example.com/v1"
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
                    />
                  </div>
                )}

                <div className="flex gap-2 text-xs">
                  <input
                    type="password"
                    value={apiKeyDrafts[p.slug] || ''}
                    onChange={(e) => setApiKeyDrafts((prev) => ({ ...prev, [p.slug]: e.target.value }))}
                    placeholder="Enter new encrypted API key..."
                    className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      updateProvider(p.slug, {
                        apiKey: apiKeyDrafts[p.slug],
                        baseUrl: baseUrlDrafts[p.slug],
                      })
                    }
                    className="px-3 py-1.5 rounded-lg bg-[#258BFF] text-white font-semibold inline-flex items-center gap-1"
                  >
                    <KeyRound className="w-3.5 h-3.5" /> Save Key
                  </button>
                </div>

                {p.lastError && (
                  <p className="text-[11px] text-rose-500 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {p.lastError}
                  </p>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                  <button
                    type="button"
                    onClick={() => updateProvider(p.slug, { isDefault: true })}
                    className={`font-semibold ${
                      p.isDefault ? 'text-[#258BFF] dark:text-[#B7F34A]' : 'text-[#8793A5] hover:text-[#258BFF]'
                    }`}
                  >
                    {p.isDefault ? (
                      <span className="inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Default Engine
                      </span>
                    ) : (
                      'Set as Default'
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={!configured || testingSlug === p.slug}
                    onClick={() => testConnection(p.slug)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 font-semibold hover:border-[#258BFF] disabled:opacity-45"
                  >
                    <Play className="w-3 h-3" /> {testingSlug === p.slug ? 'Testing...' : 'Test Connection'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Global Orchestrator Rules */}
        <form
          onSubmit={saveGlobalSettings}
          className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-4"
        >
          <h2 className="font-bold text-base text-[#071426] dark:text-white">Global AI Orchestration Rules</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.multiModelVerificationEnabled}
                onChange={(e) =>
                  setSettings((prev: any) => ({ ...prev, multiModelVerificationEnabled: e.target.checked }))
                }
              />
              <span>Enable Multi-Model Verification on Deep Research</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.autoFallbackEnabled}
                onChange={(e) => setSettings((prev: any) => ({ ...prev, autoFallbackEnabled: e.target.checked }))}
              />
              <span>Automatic Fallback Across Enabled Providers</span>
            </label>
            <div>
              <label className="block text-[#8793A5] mb-1">Max Providers per Deep Query</label>
              <input
                type="number"
                min={1}
                max={4}
                value={settings.maxProvidersPerDeepQuery}
                onChange={(e) =>
                  setSettings((prev: any) => ({ ...prev, maxProvidersPerDeepQuery: Number(e.target.value) }))
                }
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] tabular-nums"
              />
            </div>
            <div>
              <label className="block text-[#8793A5] mb-1">Provider Timeout (ms)</label>
              <input
                type="number"
                min={4000}
                max={45000}
                value={settings.timeoutMs}
                onChange={(e) => setSettings((prev: any) => ({ ...prev, timeoutMs: Number(e.target.value) }))}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] tabular-nums"
              />
            </div>
          </div>
          <div className="text-xs">
            <label className="block text-[#8793A5] mb-1">Public Privacy &amp; AI Processing Disclosure</label>
            <textarea
              rows={2}
              value={settings.privacyDisclosureText || ''}
              onChange={(e) => setSettings((prev: any) => ({ ...prev, privacyDisclosureText: e.target.value }))}
              className="w-full p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
            />
          </div>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#B7F34A] text-[#071426] text-xs font-bold"
          >
            <Save className="w-4 h-4" /> Save Orchestrator Settings
          </button>
        </form>
      </div>
    </AdminLayout>
  );
};
