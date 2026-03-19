import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, query, updateDoc, deleteDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Search,
  ShieldAlert,
  Trash2,
  Users,
} from 'lucide-react';

interface AppUser {
  id: string;
  email: string;
  role: string;
  createdAt: any;
  lastLoginAt?: any;
}

type RoleFilter = 'all' | 'admin' | 'user';

export default function UserManager() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [userToDelete, setUserToDelete] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');

  useEffect(() => {
    if (!db) return;

    const q = query(collection(db, 'users'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const usersData = snapshot.docs.map((entry) => ({
          id: entry.id,
          ...entry.data(),
        })) as AppUser[];
        setUsers(usersData);
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching users:', error);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), 3000);
    return () => clearTimeout(timer);
  }, [feedback]);

  const filteredUsers = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    return users.filter((user) => {
      const roleMatch = roleFilter === 'all' || user.role === roleFilter;
      if (!roleMatch) return false;
      if (!normalizedSearch) return true;
      return `${user.email} ${user.id}`.toLowerCase().includes(normalizedSearch);
    });
  }, [users, searchQuery, roleFilter]);

  const adminCount = users.filter((user) => user.role === 'admin').length;
  const activeTodayCount = users.filter((user) => isWithinLastDay(user.lastLoginAt)).length;

  const handleRoleChange = async (userId: string, newRole: string) => {
    if (!db || !auth.currentUser) return;

    if (userId === auth.currentUser.uid && newRole !== 'admin') {
      if (adminCount <= 1) {
        setFeedback({ message: 'Cannot demote the only admin', type: 'error' });
        return;
      }
    }

    try {
      await updateDoc(doc(db, 'users', userId), { role: newRole });
      setFeedback({ message: 'Role updated successfully', type: 'success' });
    } catch (error) {
      console.error('Error updating role:', error);
      setFeedback({ message: 'Failed to update role', type: 'error' });
    }
  };

  const confirmDeleteUser = async () => {
    if (!db || !auth.currentUser || !userToDelete) return;

    try {
      await deleteDoc(doc(db, 'users', userToDelete));
      setFeedback({ message: 'User deleted successfully', type: 'success' });
    } catch (error) {
      console.error('Error deleting user:', error);
      setFeedback({ message: 'Failed to delete user', type: 'error' });
    }
    setUserToDelete(null);
  };

  const handleDeleteClick = (userId: string) => {
    if (!auth.currentUser) return;

    if (userId === auth.currentUser.uid) {
      setFeedback({ message: 'Cannot delete your own account from here', type: 'error' });
      return;
    }

    setUserToDelete(userId);
  };

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setFeedback({ message: `${label} copied`, type: 'success' });
    } catch (error) {
      console.error(`Failed to copy ${label}:`, error);
      setFeedback({ message: `Failed to copy ${label}`, type: 'error' });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      {feedback && (
        <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-2xl shadow-2xl animate-in slide-in-from-bottom duration-300 flex items-center gap-3 border ${
          feedback.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-red-50 border-red-100 text-red-800'
        }`}>
          {feedback.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <ShieldAlert className="w-5 h-5 text-red-500" />}
          <p className="font-bold text-sm">{feedback.message}</p>
        </div>
      )}

      {userToDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="enterprise-card w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-8 text-center space-y-6">
              <div className="w-20 h-20 bg-red-50 rounded-3xl flex items-center justify-center mx-auto">
                <AlertTriangle className="w-10 h-10 text-red-600" />
              </div>
              <div className="space-y-2">
                <h3 className="text-[16px] font-black text-slate-900 tracking-tight">Delete User?</h3>
                <p className="text-slate-500 font-medium">This action cannot be undone. The user will lose access to the system immediately.</p>
              </div>
              <div className="flex gap-3 pt-4">
                <button onClick={() => setUserToDelete(null)} className="flex-1 enterprise-button-secondary">
                  Cancel
                </button>
                <button onClick={confirmDeleteUser} className="flex-1 bg-red-600 text-white hover:bg-red-700 enterprise-button shadow-sm hover:shadow">
                  Delete User
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-5">
        <div className="section-shell flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="section-kicker">Access Control</p>
            <h1 className="section-heading">User Management</h1>
            <p className="section-subcopy">Manage access, role assignments, and operator visibility for your team with cleaner review-focused controls.</p>
          </div>
          <div className="soft-block flex items-center gap-4 bg-white px-5 py-4">
            <div className="text-right">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Visible Users</p>
              <p className="text-xl font-black text-slate-900">{filteredUsers.length}</p>
            </div>
            <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center">
              <Users className="w-6 h-6 text-indigo-600" />
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryCard label="Total Users" value={users.length.toString()} tone="slate" />
          <SummaryCard label="Admins" value={adminCount.toString()} tone="indigo" />
          <SummaryCard label="Active in 24h" value={activeTodayCount.toString()} tone="emerald" />
        </div>

        <div className="flex flex-col gap-3 md:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              id="user-search"
              name="userSearch"
              type="text"
              placeholder="Search by email or UID"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm font-medium focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/5"
            />
          </div>
          <select
            id="user-role-filter"
            name="userRoleFilter"
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value as RoleFilter)}
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold"
          >
            <option value="all">All Roles</option>
            <option value="admin">Admins</option>
            <option value="user">Users</option>
          </select>
        </div>
      </div>

      <div className="table-shell">
        <div className="max-h-[68vh] overflow-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="p-4 text-xs font-black text-slate-400 uppercase tracking-widest">User</th>
                <th className="p-4 text-xs font-black text-slate-400 uppercase tracking-widest">Role</th>
                <th className="p-4 text-xs font-black text-slate-400 uppercase tracking-widest">Joined</th>
                <th className="p-4 text-xs font-black text-slate-400 uppercase tracking-widest">Last Login</th>
                <th className="p-4 text-xs font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold">
                        {(user.email || '?').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-bold text-slate-900 text-sm">{user.email}</p>
                        <div className="flex items-center gap-2">
                          <p className="text-xs text-slate-500 font-mono">{user.id}</p>
                          <button
                            onClick={() => copyText(user.id, 'UID')}
                            className="text-slate-400 hover:text-indigo-600 transition-colors"
                            title="Copy UID"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <select
                      value={user.role}
                      onChange={(event) => handleRoleChange(user.id, event.target.value)}
                      disabled={user.id === auth.currentUser?.uid && user.role === 'admin'}
                      className={`text-xs font-bold px-3 py-1.5 rounded-lg border-none focus:ring-2 focus:ring-indigo-500 ${
                        user.role === 'admin' ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td className="p-4 text-sm text-slate-500 font-medium">{formatTimestamp(user.createdAt)}</td>
                  <td className="p-4 text-sm text-slate-500 font-medium">{formatTimestamp(user.lastLoginAt)}</td>
                  <td className="p-4 text-right">
                    <button
                      onClick={() => handleDeleteClick(user.id)}
                      disabled={user.id === auth.currentUser?.uid}
                      className={`p-2 rounded-xl transition-all ${
                        user.id === auth.currentUser?.uid ? 'text-slate-300 cursor-not-allowed' : 'text-slate-400 hover:text-red-600 hover:bg-red-50'
                      }`}
                      title={user.id === auth.currentUser?.uid ? 'Cannot delete yourself' : 'Delete User'}
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone: 'slate' | 'indigo' | 'emerald' }) {
  const toneMap: Record<string, string> = {
    slate: 'bg-slate-50 border-slate-200 text-slate-800',
    indigo: 'bg-indigo-50 border-indigo-200 text-indigo-800',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  };
  return (
    <div className={`rounded-[24px] border p-4 shadow-sm ${toneMap[tone]}`}>
      <p className="text-[11px] font-black uppercase tracking-widest">{label}</p>
      <p className="mt-2 text-[24px] font-black tracking-tight">{value}</p>
    </div>
  );
}

function formatTimestamp(timestamp: any) {
  const date = timestamp?.toDate?.() || (timestamp ? new Date(timestamp) : null);
  if (!date || Number.isNaN(date.getTime())) {
    return 'Never';
  }
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

function isWithinLastDay(timestamp: any) {
  const date = timestamp?.toDate?.() || (timestamp ? new Date(timestamp) : null);
  if (!date || Number.isNaN(date.getTime())) {
    return false;
  }
  return Date.now() - date.getTime() <= 24 * 60 * 60 * 1000;
}
