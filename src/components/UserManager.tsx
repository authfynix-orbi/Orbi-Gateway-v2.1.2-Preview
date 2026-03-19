import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Shield, User, Mail, Trash2, ShieldAlert, CheckCircle2, Users, X, AlertTriangle } from 'lucide-react';

interface AppUser {
  id: string;
  email: string;
  role: string;
  createdAt: any;
  lastLoginAt?: any;
}

export default function UserManager() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{message: string, type: 'success' | 'error'} | null>(null);
  const [userToDelete, setUserToDelete] = useState<string | null>(null);

  useEffect(() => {
    if (!db) return;

    const q = query(collection(db, 'users'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const usersData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as AppUser[];
      setUsers(usersData);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching users:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleRoleChange = async (userId: string, newRole: string) => {
    if (!db || !auth.currentUser) return;
    
    // Prevent self-demotion if they are the only admin
    if (userId === auth.currentUser.uid && newRole !== 'admin') {
      const adminCount = users.filter(u => u.role === 'admin').length;
      if (adminCount <= 1) {
        setFeedback({ message: "Cannot demote the only admin", type: 'error' });
        setTimeout(() => setFeedback(null), 3000);
        return;
      }
    }

    try {
      await updateDoc(doc(db, 'users', userId), {
        role: newRole
      });
      setFeedback({ message: "Role updated successfully", type: 'success' });
    } catch (error) {
      console.error("Error updating role:", error);
      setFeedback({ message: "Failed to update role", type: 'error' });
    }
    setTimeout(() => setFeedback(null), 3000);
  };

  const confirmDeleteUser = async () => {
    if (!db || !auth.currentUser || !userToDelete) return;
    
    try {
      await deleteDoc(doc(db, 'users', userToDelete));
      setFeedback({ message: "User deleted successfully", type: 'success' });
    } catch (error) {
      console.error("Error deleting user:", error);
      setFeedback({ message: "Failed to delete user", type: 'error' });
    }
    setUserToDelete(null);
    setTimeout(() => setFeedback(null), 3000);
  };

  const handleDeleteClick = (userId: string) => {
    if (!auth.currentUser) return;
    
    if (userId === auth.currentUser.uid) {
      setFeedback({ message: "Cannot delete your own account from here", type: 'error' });
      setTimeout(() => setFeedback(null), 3000);
      return;
    }
    
    setUserToDelete(userId);
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

      {/* Delete Confirmation Modal */}
      {userToDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="enterprise-card w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-8 text-center space-y-6">
              <div className="w-20 h-20 bg-red-50 rounded-3xl flex items-center justify-center mx-auto">
                <AlertTriangle className="w-10 h-10 text-red-600" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-black text-slate-900 tracking-tight">Delete User?</h3>
                <p className="text-slate-500 font-medium">This action cannot be undone. The user will lose access to the system immediately.</p>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setUserToDelete(null)}
                  className="flex-1 enterprise-button-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDeleteUser}
                  className="flex-1 bg-red-600 text-white hover:bg-red-700 enterprise-button shadow-sm hover:shadow"
                >
                  Delete User
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">User Management</h1>
          <p className="text-slate-500 font-medium">Manage access and roles for your team.</p>
        </div>
        <div className="flex items-center gap-4 enterprise-card px-6 py-3">
          <div className="text-right">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Users</p>
            <p className="text-xl font-black text-slate-900">{users.length}</p>
          </div>
          <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center">
            <Users className="w-6 h-6 text-indigo-600" />
          </div>
        </div>
      </div>

      <div className="enterprise-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="p-4 text-xs font-black text-slate-400 uppercase tracking-widest">User</th>
                <th className="p-4 text-xs font-black text-slate-400 uppercase tracking-widest">Role</th>
                <th className="p-4 text-xs font-black text-slate-400 uppercase tracking-widest">Joined</th>
                <th className="p-4 text-xs font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold">
                        {user.email.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-bold text-slate-900 text-sm">{user.email}</p>
                        <p className="text-xs text-slate-500 font-mono">{user.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <select
                      value={user.role}
                      onChange={(e) => handleRoleChange(user.id, e.target.value)}
                      disabled={user.id === auth.currentUser?.uid && user.role === 'admin'}
                      className={`text-xs font-bold px-3 py-1.5 rounded-lg border-none focus:ring-2 focus:ring-indigo-500 ${
                        user.role === 'admin' 
                          ? 'bg-indigo-50 text-indigo-700' 
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td className="p-4 text-sm text-slate-500 font-medium">
                    {user.createdAt?.toDate ? new Date(user.createdAt.toDate()).toLocaleDateString() : 'Unknown'}
                  </td>
                  <td className="p-4 text-right">
                    <button
                      onClick={() => handleDeleteClick(user.id)}
                      disabled={user.id === auth.currentUser?.uid}
                      className={`p-2 rounded-xl transition-all ${
                        user.id === auth.currentUser?.uid
                          ? 'text-slate-300 cursor-not-allowed'
                          : 'text-slate-400 hover:text-red-600 hover:bg-red-50'
                      }`}
                      title={user.id === auth.currentUser?.uid ? "Cannot delete yourself" : "Delete User"}
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
