import React, { useEffect, useState } from 'react';
import { RefreshCw, ScrollText } from 'lucide-react';
import { AdminLayout } from './AdminLayout';
import { apiFetch } from '../../services/api';
import { useApp } from '../../context/AppContext';

export const AdminAuditLogsPage: React.FC = () => {
  const { addToast } = useApp();
  const [tab, setTab] = useState<'admin' | 'platform' | 'logins' | 'support'>('admin');
  const [adminAudits, setAdminAudits] = useState<any[]>([]);
  const [loginLogs, setLoginLogs] = useState<any[]>([]);
  const [platformAudits, setPlatformAudits] = useState<any[]>([]);
  const [supportMessages, setSupportMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const [secRes, auditRes] = await Promise.all([
        apiFetch<any>('/api/admin/security/overview'),
        apiFetch<{ auditLogs: any[]; supportMessages: any[] }>('/api/admin/audit-logs'),
      ]);
      setAdminAudits(secRes.adminAuditLogs || []);
      setLoginLogs(secRes.loginLogs || []);
      setPlatformAudits(auditRes.auditLogs || []);
      setSupportMessages(auditRes.supportMessages || []);
    } catch (err: any) {
      addToast(err.message || 'Failed to load audit logs.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  return (
    <AdminLayout
      title="Audit Logs & Traceability"
      subtitle="Immutable records of administrator mutations, authentication attempts, platform events, and contact submissions."
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2 text-xs">
            {[
              { id: 'admin', label: `Admin Actions (${adminAudits.length})` },
              { id: 'logins', label: `Admin Logins (${loginLogs.length})` },
              { id: 'platform', label: `System Audit (${platformAudits.length})` },
              { id: 'support', label: `Contact Inbox (${supportMessages.length})` },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id as any)}
                className={`px-3.5 py-2 rounded-xl font-semibold transition-colors ${
                  tab === item.id
                    ? 'bg-[#258BFF] text-white'
                    : 'bg-white dark:bg-[#10243D] border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={loadLogs}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:border-[#258BFF]"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
            <ScrollText className="w-4 h-4 text-[#258BFF]" />
            <h2 className="font-bold text-sm text-[#071426] dark:text-white">Audit Stream</h2>
          </div>

          {loading ? (
            <div className="p-8 text-center text-xs text-[#8793A5]">Loading audit records...</div>
          ) : tab === 'admin' ? (
            <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
              {adminAudits.map((row) => (
                <div key={row.id} className="p-4 flex items-start justify-between gap-4">
                  <div className="space-y-1 min-w-0">
                    <p className="font-bold text-[#071426] dark:text-white">
                      {row.action}{' '}
                      <span className="font-normal text-[#8793A5]">
                        on {row.targetResource} {row.targetId ? `(${row.targetId})` : ''}
                      </span>
                    </p>
                    <p className="text-[11px] text-[#8793A5]">
                      Actor: {row.actorEmail} · IP: {row.ipAddress || 'unknown'}
                    </p>
                  </div>
                  <span className="text-[11px] text-[#8793A5] whitespace-nowrap tabular-nums">
                    {row.createdAt ? new Date(row.createdAt).toLocaleString() : '—'}
                  </span>
                </div>
              ))}
            </div>
          ) : tab === 'logins' ? (
            <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
              {loginLogs.map((row) => (
                <div key={row.id} className="p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-bold text-[#071426] dark:text-white">{row.email}</p>
                    <p className="text-[11px] text-[#8793A5]">
                      {row.authMethod} · IP {row.ipAddress || 'unknown'}
                      {row.failureReason ? ` · ${row.failureReason}` : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className={`font-bold ${row.success ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {row.success ? 'SUCCESS' : 'FAILED'}
                    </span>
                    <div className="text-[11px] text-[#8793A5] tabular-nums">
                      {row.createdAt ? new Date(row.createdAt).toLocaleString() : '—'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : tab === 'platform' ? (
            <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
              {platformAudits.map((row) => (
                <div key={row.id} className="p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-bold text-[#071426] dark:text-white">{row.action}</p>
                    <p className="text-[11px] text-[#8793A5]">
                      Target: {row.targetType} {row.targetId || ''}
                    </p>
                  </div>
                  <span className="text-[11px] text-[#8793A5] tabular-nums">
                    {row.createdAt ? new Date(row.createdAt).toLocaleString() : '—'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
              {supportMessages.map((msg) => (
                <div key={msg.id} className="p-4 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#071426] dark:text-white">
                      {msg.subject} — {msg.name} ({msg.email})
                    </span>
                    <span className="text-[11px] text-[#8793A5] tabular-nums">
                      {msg.createdAt ? new Date(msg.createdAt).toLocaleString() : '—'}
                    </span>
                  </div>
                  <p className="text-slate-600 dark:text-slate-300">{msg.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
};
