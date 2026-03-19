/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, User } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth, isFirebaseConfigured } from './firebase';
import { FcGoogle } from 'react-icons/fc';
import { MessageSquare, ChevronRight, Activity, Smartphone, Users, LogOut, LayoutDashboard, AlertCircle, Send, Menu, X } from 'lucide-react';
import TemplateManager from './components/TemplateManager';
import DeviceManager from './components/DeviceManager';
import Dashboard from './components/Dashboard';
import Settings from './components/Settings';
import ActivityLogs from './components/ActivityLogs';
import MessageTracker from './components/MessageTracker';
import UserManager from './components/UserManager';

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 flex items-center justify-center h-full bg-slate-50">
          <div className="enterprise-card p-10 max-w-lg w-full text-center space-y-6 border-red-100">
            <div className="w-20 h-20 bg-red-50 rounded-3xl flex items-center justify-center mx-auto">
              <AlertCircle className="w-10 h-10 text-red-500" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">Something went wrong</h2>
              <p className="text-slate-500 text-sm font-medium">
                The application encountered an unexpected error. Our team has been notified.
              </p>
            </div>
            <div className="p-4 bg-slate-50 rounded-2xl text-left overflow-x-auto">
              <code className="text-[10px] font-mono text-red-600 break-all">
                {this.state.error?.toString()}
              </code>
            </div>
            <button 
              onClick={() => window.location.reload()}
              className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-black transition-all shadow-xl shadow-slate-200"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const LOGO_URL = "https://limcgmcytzvotxhthqiu.supabase.co/storage/v1/object/public/PLATFROM%20STOCKS/Platform%20Logos/OBI_ICON_WATERMARK.png";

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'templates' | 'logs' | 'devices' | 'users' | 'settings' | 'messages'>('dashboard');
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<'admin' | 'user' | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!auth || !db) return;
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          const isAdminEmail = (user.email === 'danielzachason25@gmail.com' || user.email === 'auth.fynix@gmail.com') && user.emailVerified === true;
          
          if (userDoc.exists()) {
            const currentRole = userDoc.data().role;
            if (isAdminEmail && currentRole !== 'admin') {
              // Upgrade to admin
              await updateDoc(doc(db, 'users', user.uid), { role: 'admin' });
              setUserRole('admin');
            } else {
              setUserRole(currentRole);
            }
          } else {
            await setDoc(doc(db, 'users', user.uid), {
              email: user.email,
              displayName: user.displayName,
              photoURL: user.photoURL,
              role: isAdminEmail ? 'admin' : 'user',
              createdAt: serverTimestamp(),
            });
            setUserRole(isAdminEmail ? 'admin' : 'user');
          }
        } catch (error) {
          console.error('App: Error fetching/creating user doc:', error);
        }
      } else {
        setUserRole(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    if (isLoggingIn || !auth) return;
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error('Login failed:', error);
      if (error.code === 'auth/unauthorized-domain') {
        setLoginError(`Domain "${window.location.hostname}" is not authorized in Firebase. Please add it to Authorized Domains in Firebase Console.`);
      } else if (error.code === 'auth/popup-blocked') {
        setLoginError('Sign-in popup was blocked by your browser. Please allow popups for this site.');
      } else if (error.code === 'auth/popup-closed-by-user') {
        // Silently handle cancellation, or provide a subtle message
        setLoginError('Sign-in was cancelled.');
      } else {
        setLoginError(`Login failed: ${error.message || 'Please try again.'}`);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    if (!auth) return;
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-100">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="enterprise-card p-10 max-w-md w-full text-center space-y-8 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-indigo-600 via-purple-600 to-emerald-500"></div>
          <div className="space-y-4">
            <div className="relative w-48 h-48 mx-auto group">
              {/* Floating Logo */}
              <div className="relative z-10 w-full h-full transition-transform duration-700 ease-in-out group-hover:scale-110">
                <img 
                  src={LOGO_URL} 
                  alt="ORBI Logo" 
                  className="w-full h-full object-contain drop-shadow-[0_8px_12px_rgba(0,0,0,0.15)]" 
                  referrerPolicy="no-referrer" 
                />
              </div>
            </div>
            <div className="space-y-2 pt-8">
              <h1 className="brand-display text-[16px] text-slate-900">ORBI GATEWAY</h1>
              <p className="text-slate-500 text-sm font-medium px-4">
                Enterprise-grade SMS & Notification infrastructure for modern businesses.
              </p>
            </div>
          </div>
          <div className="space-y-4">
            <button
              onClick={handleLogin}
              disabled={isLoggingIn || !isFirebaseConfigured}
              className={`w-full bg-slate-900 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-3 transition-all shadow-lg shadow-slate-200 active:scale-[0.98] ${
                isLoggingIn ? 'opacity-70 cursor-not-allowed' : 'hover:bg-slate-800 hover:shadow-xl'
              }`}
            >
              {isLoggingIn ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              ) : (
                <FcGoogle className="w-5 h-5" />
              )}
              {isLoggingIn ? 'Authenticating...' : 'Sign in with Corporate Account'}
            </button>
            {loginError && (
              <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-[11px] text-red-600 font-bold uppercase tracking-wider">
                {loginError}
              </div>
            )}
          </div>
          <div className="pt-4 border-t border-slate-100">
            <p className="text-[10px] text-slate-400 uppercase tracking-[0.2em] font-black">
              Authorized Personnel Only
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-50 font-sans overflow-hidden">
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between bg-white border-b border-slate-200 p-4 z-40 fixed top-0 w-full">
        <div className="flex items-center gap-3">
          <img 
            src={LOGO_URL} 
            alt="Logo" 
            className="w-8 h-8 object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.1)]" 
            referrerPolicy="no-referrer" 
          />
          <span className="brand-display text-[14px] text-slate-900 leading-none">ORBI GATEWAY</span>
        </div>
        <button 
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
        >
          {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 w-72 bg-white border-r border-slate-200 flex flex-col shadow-2xl md:shadow-sm z-50 transform ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0 transition-transform duration-300 ease-in-out`}>
        <div className="p-8 flex items-center justify-between md:justify-start gap-4">
          <div className="flex items-center gap-4">
            <img 
              src={LOGO_URL} 
              alt="Logo" 
              className="w-12 h-12 object-contain drop-shadow-[0_4px_6px_rgba(0,0,0,0.1)]" 
              referrerPolicy="no-referrer" 
            />
            <div>
              <span className="brand-display block text-[14px] text-slate-900 leading-none">ORBI GATEWAY</span>
              <span className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em]">Admin Control Portal</span>
            </div>
          </div>
          <button 
            className="md:hidden p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 px-4 space-y-2 overflow-y-auto py-4">
          <p className="px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Management</p>
          <button 
            onClick={() => { setActiveTab('dashboard'); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all ${
              activeTab === 'dashboard' 
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' 
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <LayoutDashboard className="w-5 h-5" />
            Dashboard
            {activeTab === 'dashboard' && <ChevronRight className="w-4 h-4 ml-auto" />}
          </button>

          <button 
            onClick={() => { setActiveTab('templates'); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all ${
              activeTab === 'templates' 
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' 
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <MessageSquare className="w-5 h-5" />
            Templates
            {activeTab === 'templates' && <ChevronRight className="w-4 h-4 ml-auto" />}
          </button>
          
          <button 
            onClick={() => { setActiveTab('messages'); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all ${
              activeTab === 'messages' 
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' 
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <Send className="w-5 h-5" />
            Messages
            {activeTab === 'messages' && <ChevronRight className="w-4 h-4 ml-auto" />}
          </button>
          
          <button 
            onClick={() => { setActiveTab('logs'); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all ${
              activeTab === 'logs' 
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' 
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <Activity className="w-5 h-5" />
            Activity
            {activeTab === 'logs' && <ChevronRight className="w-4 h-4 ml-auto" />}
          </button>

          <button 
            onClick={() => { setActiveTab('devices'); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all ${
              activeTab === 'devices' 
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' 
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <Smartphone className="w-5 h-5" />
            Devices
            {activeTab === 'devices' && <ChevronRight className="w-4 h-4 ml-auto" />}
          </button>

          {userRole === 'admin' && (
            <>
              <div className="pt-6 pb-2">
                <p className="px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Administration</p>
              </div>
              <button 
                onClick={() => { setActiveTab('users'); setIsMobileMenuOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all ${
                  activeTab === 'users' 
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' 
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Users className="w-5 h-5" />
                Users
                {activeTab === 'users' && <ChevronRight className="w-4 h-4 ml-auto" />}
              </button>

              <button 
                onClick={() => { setActiveTab('settings'); setIsMobileMenuOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all ${
                  activeTab === 'settings' 
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' 
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <AlertCircle className="w-5 h-5" />
                Settings
                {activeTab === 'settings' && <ChevronRight className="w-4 h-4 ml-auto" />}
              </button>
            </>
          )}
        </nav>

        <div className="p-6">
          <div className="bg-slate-900 rounded-3xl p-4 flex items-center gap-3 shadow-xl">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500 flex items-center justify-center text-white font-black text-sm overflow-hidden border-2 border-slate-800">
              {user.photoURL ? (
                <img src={user.photoURL} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                user.email?.charAt(0).toUpperCase()
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-black text-white truncate">{user.displayName || user.email}</p>
              <p className="text-[9px] text-indigo-400 uppercase tracking-widest font-black">
                {userRole === 'admin' ? 'System Admin' : 'Operator'}
              </p>
            </div>
            <button 
              onClick={handleLogout}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto pt-16 md:pt-0">
        {activeTab === 'dashboard' && (
          <ErrorBoundary>
            <Dashboard user={user} />
          </ErrorBoundary>
        )}
        {activeTab === 'templates' && (
          <ErrorBoundary>
            <TemplateManager />
          </ErrorBoundary>
        )}
        {activeTab === 'messages' && (
          <ErrorBoundary>
            <MessageTracker />
          </ErrorBoundary>
        )}
        {activeTab === 'devices' && (
          <ErrorBoundary>
            <DeviceManager />
          </ErrorBoundary>
        )}
        {activeTab === 'logs' && (
          <ErrorBoundary>
            <ActivityLogs />
          </ErrorBoundary>
        )}
        {activeTab === 'users' && (
          <ErrorBoundary>
            <UserManager />
          </ErrorBoundary>
        )}
        {activeTab === 'settings' && (
          <ErrorBoundary>
            <Settings />
          </ErrorBoundary>
        )}
      </main>
    </div>
  );
}
