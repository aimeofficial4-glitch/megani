import React, { useEffect, useState } from 'react';
import { Plus, Save } from 'lucide-react';
import { AdminLayout } from './AdminLayout';
import { apiFetch } from '../../services/api';
import { useApp } from '../../context/AppContext';

export const AdminRolesPage: React.FC = () => {
  const { addToast } = useApp();
  const [roles, setRoles] = useState<any[]>([]);
  const [permissions, setPermissions] = useState<any[]>([]);
  const [mappings, setMappings] = useState<any[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string>('');
  const [selectedPerms, setSelectedPerms] = useState<string[]>([]);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDesc, setNewRoleDesc] = useState('');

  const loadData = async () => {
    try {
      const res = await apiFetch<{ roles: any[]; permissions: any[]; rolePermissions: any[] }>('/api/admin/roles');
      setRoles(res.roles || []);
      setPermissions(res.permissions || []);
      setMappings(res.rolePermissions || []);
      if (!selectedRoleId && res.roles?.length > 0) {
        const firstId = res.roles[0].id;
        setSelectedRoleId(firstId);
        setSelectedPerms(
          (res.rolePermissions || []).filter((m) => m.roleId === firstId).map((m) => m.permissionId)
        );
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const selectRole = (roleId: string) => {
    setSelectedRoleId(roleId);
    setSelectedPerms(mappings.filter((m) => m.roleId === roleId).map((m) => m.permissionId));
  };

  const togglePerm = (permId: string) => {
    setSelectedPerms((prev) => (prev.includes(permId) ? prev.filter((id) => id !== permId) : [...prev, permId]));
  };

  const handleSavePermissions = async () => {
    if (!selectedRoleId) return;
    try {
      await apiFetch(`/api/admin/roles/${selectedRoleId}/permissions`, {
        method: 'PUT',
        body: JSON.stringify({ permissionIds: selectedPerms }),
      });
      addToast('Role permissions updated.', 'success');
      loadData();
    } catch (err: any) {
      addToast(err.message || 'Failed to update permissions.', 'error');
    }
  };

  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoleName.trim()) return;
    try {
      await apiFetch('/api/admin/roles', {
        method: 'POST',
        body: JSON.stringify({ name: newRoleName.trim(), description: newRoleDesc.trim() }),
      });
      setNewRoleName('');
      setNewRoleDesc('');
      addToast('Role created.', 'success');
      loadData();
    } catch (err: any) {
      addToast(err.message || 'Unable to create role.', 'error');
    }
  };

  return (
    <AdminLayout
      title="Roles & Permissions"
      subtitle="Manage role-based access control (RBAC) across 2MR accounts and operational scopes."
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 space-y-4">
          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-3">
            <h2 className="font-bold text-sm text-[#071426] dark:text-white">Platform Roles</h2>
            <div className="space-y-2">
              {roles.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => selectRole(r.id)}
                  className={`w-full text-left p-3 rounded-xl border text-xs transition ${
                    selectedRoleId === r.id
                      ? 'border-[#258BFF] bg-[#258BFF]/10'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#071426]'
                  }`}
                >
                  <div className="font-bold uppercase text-[#071426] dark:text-white">{r.name}</div>
                  <div className="text-[#8793A5] mt-0.5">{r.description}</div>
                </button>
              ))}
            </div>
          </div>

          <form
            onSubmit={handleCreateRole}
            className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-3"
          >
            <h3 className="font-bold text-sm text-[#071426] dark:text-white">Create Custom Role</h3>
            <input
              type="text"
              required
              value={newRoleName}
              onChange={(e) => setNewRoleName(e.target.value)}
              placeholder="Role key (e.g. moderator)"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-xs"
            />
            <input
              type="text"
              value={newRoleDesc}
              onChange={(e) => setNewRoleDesc(e.target.value)}
              placeholder="Description..."
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-xs"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#B7F34A] text-[#071426] text-xs font-bold"
            >
              <Plus className="w-3.5 h-3.5" /> Add Role
            </button>
          </form>
        </div>

        <div className="lg:col-span-7 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-sm text-[#071426] dark:text-white">Assigned Permissions</h2>
            <button
              type="button"
              onClick={handleSavePermissions}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#258BFF] text-white text-xs font-semibold"
            >
              <Save className="w-3.5 h-3.5" /> Save Role Scopes
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {permissions.map((perm) => (
              <label
                key={perm.id}
                className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#071426] text-xs cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedPerms.includes(perm.id)}
                  onChange={() => togglePerm(perm.id)}
                  className="mt-0.5"
                />
                <div>
                  <div className="font-mono font-bold text-[#071426] dark:text-white">{perm.code}</div>
                  <div className="text-[#8793A5]">{perm.description}</div>
                </div>
              </label>
            ))}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};
