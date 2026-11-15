import React, { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { apiFetch } from '../../services/api';
import { useApp } from '../../context/AppContext';
import { AppUser } from '../../types';
import { AdminLayout } from './AdminLayout';

export const AdminUsersPage: React.FC = () => {
  const { addToast } = useApp();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [filterQ, setFilterQ] = useState('');

  const loadUsers = () => {
    apiFetch<{ users: AppUser[] }>('/api/admin/users')
      .then((res) => setUsers(res.users || []))
      .catch(() => {});
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const updateUser = async (id: string, payload: { role?: string; status?: string }) => {
    try {
      await apiFetch(`/api/admin/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      loadUsers();
      addToast('User record updated.', 'success');
    } catch (err: any) {
      addToast(err.message || 'Update failed.', 'error');
    }
  };

  const filtered = users.filter(
    (u) =>
      !filterQ.trim() ||
      u.email.toLowerCase().includes(filterQ.toLowerCase()) ||
      u.fullName.toLowerCase().includes(filterQ.toLowerCase())
  );

  return (
    <AdminLayout
      title="User Management"
      subtitle="Search registered users, inspect AI quotas, and manage tier roles or account status."
    >
      <div className="relative max-w-sm">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={filterQ}
          onChange={(e) => setFilterQ(e.target.value)}
          placeholder="Search users by name or email..."
          className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#10243D] text-xs"
        />
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 text-[#8793A5]">
              <th className="p-4">User</th>
              <th className="p-4">Organization</th>
              <th className="p-4">Role</th>
              <th className="p-4">Status</th>
              <th className="p-4">AI Usage</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map((u) => (
              <tr key={u.id}>
                <td className="p-4">
                  <div className="font-bold text-[#071426] dark:text-white">{u.fullName}</div>
                  <div className="text-[#8793A5]">{u.email}</div>
                </td>
                <td className="p-4 text-[#8793A5]">{u.organization || '—'}</td>
                <td className="p-4">
                  <select
                    value={u.role}
                    disabled={u.email === '2mr@proton.me'}
                    onChange={(e) => updateUser(u.id, { role: e.target.value })}
                    className="px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
                  >
                    <option value="free">free</option>
                    <option value="premium">premium</option>
                    <option value="admin">admin</option>
                  </select>
                </td>
                <td className="p-4">
                  <select
                    value={u.status}
                    disabled={u.email === '2mr@proton.me'}
                    onChange={(e) => updateUser(u.id, { status: e.target.value })}
                    className="px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
                  >
                    <option value="active">active</option>
                    <option value="suspended">suspended</option>
                  </select>
                </td>
                <td className="p-4 font-mono tabular-nums">
                  {u.aiQueriesUsed} / {u.aiQueriesLimit}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
};
