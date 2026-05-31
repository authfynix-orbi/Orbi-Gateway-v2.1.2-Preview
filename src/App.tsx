/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, User } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth, isFirebaseConfigured } from './firebase';
import { FcGoogle } from 'react-icons/fc';
import { MessageSquare, ChevronRight, Smartphone, Users, LogOut, LayoutDashboard, AlertCircle, Send, Menu, X, BookOpen } from 'lucide-react';
import TemplateManager from './components/TemplateManager';
import DeviceManager from './components/DeviceManager';
import Dashboard from './components/Dashboard';
import Settings from './components/Settings';
import MessageTracker from './components/MessageTracker';
import UserManager from './components/UserManager';
import TalkDocumentation from './components/TalkDocumentation';

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
  const [activeTab, setActiveTab] = useState<'dashboard' | 'templates' | 'messages' | 'devices' | 'docs' | 'users' | 'settings'>('dashboard');
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<'admin' | 'user' | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [pageTransitionKey, setPageTransitionKey] = useState(0);

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

  useEffect(() => {
    setPageTransitionKey((current) => current + 1);
  }, [activeTab]);

  const renderActiveView = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <ErrorBoundary>
            <Dashboard user={user} />
          </ErrorBoundary>
        );
      case 'templates':
        return (
          <ErrorBoundary>
            <TemplateManager />
          </ErrorBoundary>
        );
      case 'messages':
        return (
          <ErrorBoundary>
            <MessageTracker />
          </ErrorBoundary>
        );
      case 'devices':
        return (
          <ErrorBoundary>
            <DeviceManager />
          </ErrorBoundary>
        );
      case 'docs':
        return (
          <ErrorBoundary>
            <TalkDocumentation />
          </ErrorBoundary>
        );
      case 'users':
        return (
          <ErrorBoundary>
            <UserManager />
          </ErrorBoundary>
        );
      case 'settings':
        return (
          <ErrorBoundary>
            <Settings />
          </ErrorBoundary>
        );
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-orb-shell">
          <div className="loading-orb"></div>
          <div className="loading-orb-core"></div>
        </div>
        <div className="space-y-2 text-center">
          <p className="section-kicker">Launching Console</p>
          <p className="display-heading text-[15px]">Preparing ORBI TALK GATEWAY</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="enterprise-card enterprise-card-strong page-fade-in relative w-full max-w-lg overflow-hidden p-10 text-center space-y-8">
          <div className="absolute top-0 left-0 w-full h-2 bg-[linear-gradient(90deg,#0f766e,#2563eb,#f59e0b)]"></div>
          <div className="pointer-events-none absolute inset-x-10 top-0 h-24 rounded-full bg-cyan-100/70 blur-3xl"></div>
          <div className="space-y-4">
            <div className="relative h-60 w-60 mx-auto group md:h-72 md:w-72">
              {/* Floating Logo */}
              <div className="motion-float relative z-10 w-full h-full transition-transform duration-700 ease-in-out group-hover:scale-110">
                <img 
                  src={LOGO_URL} 
                  alt="ORBI Logo" 
                  className="w-full h-full object-contain drop-shadow-[0_8px_12px_rgba(0,0,0,0.15)]" 
                  referrerPolicy="no-referrer" 
                />
              </div>
            </div>
            <div className="space-y-2 pt-6">
              <p className="section-kicker">Operations Console</p>
              <h1 className="display-heading text-[2.15rem] md:text-[2.6rem]">ORBI Talk Gateway</h1>
              <p className="text-slate-600 text-sm font-medium px-4 leading-6">
                Enterprise-grade SMS & Notification infrastructure for modern businesses.
              </p>
            </div>
          </div>
          <div className="space-y-4">
            <button
              onClick={handleLogin}
              disabled={isLoggingIn || !isFirebaseConfigured}
              className={`enterprise-button-primary w-full ${
                isLoggingIn ? 'opacity-70 cursor-not-allowed' : ''
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
      <div className="md:hidden flex items-center justify-between border-b border-slate-200 bg-white/90 p-4 z-40 fixed top-0 w-full backdrop-blur">
        <div className="flex items-center gap-3">
          <img 
            src={LOGO_URL} 
            alt="Logo" 
            className="h-11 w-11 object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.12)]" 
            referrerPolicy="no-referrer" 
          />
          <span className="display-heading text-[0.8rem] leading-none">ORBI GATEWAY</span>
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
          className="page-fade-in fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`app-sidebar fixed inset-y-0 left-0 w-72 flex flex-col shadow-2xl md:shadow-sm z-50 transform ${isMobileMenuOpen ? 'translate-x-0 sidebar-slide-in' : '-translate-x-full'} md:relative md:translate-x-0 transition-transform duration-300 ease-in-out`}>
        <div className="p-8 flex items-center justify-between md:justify-start gap-4">
          <div className="flex items-center gap-4">
            <img 
              src={LOGO_URL} 
              alt="Logo" 
              className="h-16 w-16 object-contain drop-shadow-[0_10px_18px_rgba(0,0,0,0.12)]" 
              referrerPolicy="no-referrer" 
            />
            <div>
              <span className="display-heading block text-[0.92rem] leading-none">ORBI GATEWAY</span>
              <span className="text-[10px] font-black text-cyan-700 uppercase tracking-[0.24em]">Admin Control Portal</span>
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
            className={`tab-button ${
              activeTab === 'dashboard' 
                ? 'tab-button-active' 
                : 'tab-button-idle'
            }`}
          >
            <LayoutDashboard className="w-5 h-5" />
            Dashboard
            {activeTab === 'dashboard' && <ChevronRight className="w-4 h-4 ml-auto" />}
          </button>

          <button 
            onClick={() => { setActiveTab('templates'); setIsMobileMenuOpen(false); }}
            className={`tab-button ${
              activeTab === 'templates' 
                ? 'tab-button-active' 
                : 'tab-button-idle'
            }`}
          >
            <MessageSquare className="w-5 h-5" />
            Templates
            {activeTab === 'templates' && <ChevronRight className="w-4 h-4 ml-auto" />}
          </button>
          
          <button 
            onClick={() => { setActiveTab('messages'); setIsMobileMenuOpen(false); }}
            className={`tab-button ${
              activeTab === 'messages' 
                ? 'tab-button-active' 
                : 'tab-button-idle'
            }`}
          >
            <Send className="w-5 h-5" />
            Messages
            {activeTab === 'messages' && <ChevronRight className="w-4 h-4 ml-auto" />}
          </button>
          
          <button 
            onClick={() => { setActiveTab('devices'); setIsMobileMenuOpen(false); }}
            className={`tab-button ${
              activeTab === 'devices' 
                ? 'tab-button-active' 
                : 'tab-button-idle'
            }`}
          >
            <Smartphone className="w-5 h-5" />
            Devices
            {activeTab === 'devices' && <ChevronRight className="w-4 h-4 ml-auto" />}
          </button>

          <button
            onClick={() => { setActiveTab('docs'); setIsMobileMenuOpen(false); }}
            className={`tab-button ${
              activeTab === 'docs'
                ? 'tab-button-active'
                : 'tab-button-idle'
            }`}
          >
            <BookOpen className="w-5 h-5" />
            API Docs
            {activeTab === 'docs' && <ChevronRight className="w-4 h-4 ml-auto" />}
          </button>

          {userRole === 'admin' && (
            <>
              <div className="pt-6 pb-2">
                <p className="px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Administration</p>
              </div>
	              <button 
	                onClick={() => { setActiveTab('users'); setIsMobileMenuOpen(false); }}
	                className={`tab-button ${
	                  activeTab === 'users' 
	                    ? 'tab-button-active' 
	                    : 'tab-button-idle'
	                }`}
	              >
                <Users className="w-5 h-5" />
                Users
                {activeTab === 'users' && <ChevronRight className="w-4 h-4 ml-auto" />}
              </button>

	              <button 
	                onClick={() => { setActiveTab('settings'); setIsMobileMenuOpen(false); }}
	                className={`tab-button ${
	                  activeTab === 'settings' 
	                    ? 'tab-button-active' 
	                    : 'tab-button-idle'
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
          <div className="rounded-3xl bg-[linear-gradient(135deg,#0f172a,#15365f)] p-4 flex items-center gap-3 shadow-xl">
            <div className="w-10 h-10 rounded-2xl bg-cyan-500 flex items-center justify-center text-white font-black text-sm overflow-hidden border-2 border-slate-800">
              {user.photoURL ? (
                <img src={user.photoURL} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                user.email?.charAt(0).toUpperCase()
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-black text-white truncate">{user.displayName || user.email}</p>
              <p className="text-[9px] text-cyan-300 uppercase tracking-[0.28em] font-black">
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
        <div key={pageTransitionKey} className="page-shell">
          {renderActiveView()}
        </div>
      </main>
    </div>
  );
}
