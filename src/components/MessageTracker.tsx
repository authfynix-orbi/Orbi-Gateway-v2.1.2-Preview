import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, orderBy, doc, where, getDoc, getDocs } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { MessageSquare, Trash2, RefreshCw, Eye, Filter, X, CheckCircle2, Clock, AlertCircle, Send, Plus, Loader2 } from 'lucide-react';

interface MessageLog {
  id: string;
  status: 'pending' | 'queued' | 'processing' | 'sent' | 'delivered' | 'failed';
  error?: string;
  timestamp: any;
  deliveredAt?: any;
  createdBy: string;
  body: string;
  recipient: string;
  retryCount?: number;
}

interface Template {
  id: string;
  name: string;
  body: string;
}

export default function MessageTracker() {
  const [messages, setMessages] = useState<MessageLog[]>([]);
  const [filter, setFilter] = useState<'all' | 'pending' | 'queued' | 'processing' | 'sent' | 'delivered' | 'failed'>('all');
  const [selectedMessage, setSelectedMessage] = useState<MessageLog | null>(null);
  const [isResending, setIsResending] = useState<string | null>(null);
  
  // Custom Send Modal State
  const [isSendModalOpen, setIsSendModalOpen] = useState(false);
  const [sendType, setSendType] = useState<'raw' | 'template'>('raw');
  const [recipient, setRecipient] = useState('');
  const [body, setBody] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);

  useEffect(() => {
    console.log('MessageTracker useEffect running, auth.currentUser:', auth.currentUser);
    if (!db || !auth.currentUser) {
      console.log('MessageTracker useEffect returning early, db or auth.currentUser missing');
      return;
    }
    console.log('MessageTracker useEffect proceeding');

    let unsubscribe: () => void;

    const setupListener = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', auth.currentUser!.uid));
        const isAdmin = (userDoc.exists() && userDoc.data().role === 'admin') || 
                        (auth.currentUser?.email === 'auth.fynix@gmail.com' && auth.currentUser?.emailVerified === true);

        const q = isAdmin 
          ? query(collection(db, 'message_logs'), orderBy('timestamp', 'desc'))
          : query(collection(db, 'message_logs'), where('createdBy', '==', auth.currentUser!.uid), orderBy('timestamp', 'desc'));

        unsubscribe = onSnapshot(q, (snapshot) => {
          console.log('MessageTracker snapshot size:', snapshot.size);
          const msgs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as MessageLog));
          console.log('MessageTracker msgs:', msgs);
          setMessages(msgs);
        }, (error) => {
          console.error("MessageTracker: Error fetching messages:", error);
        });
      } catch (error) {
        console.error("MessageTracker: Error setting up listener:", error);
      }
    };

    setupListener();

    return () => { if (unsubscribe) unsubscribe(); };
  }, [auth.currentUser]);

  useEffect(() => {
    if (feedback) {
      const timer = setTimeout(() => setFeedback(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [feedback]);

  // Fetch templates for the dropdown
  useEffect(() => {
    if (!db || !auth.currentUser || !isSendModalOpen) return;
    const fetchTemplates = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', auth.currentUser!.uid));
        const isAdmin = (userDoc.exists() && userDoc.data().role === 'admin') ||
                        (auth.currentUser?.email === 'auth.fynix@gmail.com' && auth.currentUser?.emailVerified === true);
        const q = isAdmin
          ? query(collection(db, 'message_templates'), orderBy('name'))
          : query(collection(db, 'message_templates'), where('createdBy', '==', auth.currentUser!.uid), orderBy('name'));
        const snap = await getDocs(q);
        setTemplates(snap.docs.map(d => ({ id: d.id, name: d.data().name, body: d.data().body })));
      } catch (err) {
        console.error("Error fetching templates:", err);
      }
    };
    fetchTemplates();
  }, [isSendModalOpen, auth.currentUser]);

  const filteredMessages = filter === 'all' ? messages : messages.filter(m => m.status === filter);

  const deleteMessage = async (id: string) => {
    if (!auth.currentUser) return;
    setIsDeleting(id);
    try {
      const token = await auth.currentUser.getIdToken();
      const response = await fetch(`/api/messages/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete message');
      }
      setFeedback({ message: 'Message deleted', type: 'success' });
      if (selectedMessage?.id === id) {
        setSelectedMessage(null);
      }
    } catch (error: any) {
      console.error('Failed to delete message:', error);
      setFeedback({ message: error.message || 'Failed to delete message', type: 'error' });
    } finally {
      setIsDeleting(null);
    }
  };

  const clearAll = async () => {
    if (!auth.currentUser || filteredMessages.length === 0) return;
    setIsClearing(true);
    try {
      const token = await auth.currentUser.getIdToken();
      const response = await fetch('/api/messages/bulk-delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ messageIds: filteredMessages.map((m) => m.id) }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to clear messages');
      }
      setFeedback({ message: `Deleted ${data.deletedCount || 0} messages`, type: 'success' });
      setSelectedMessage(null);
    } catch (error: any) {
      console.error('Failed to clear messages:', error);
      setFeedback({ message: error.message || 'Failed to clear messages', type: 'error' });
    } finally {
      setIsClearing(false);
    }
  };

  const handleResend = async (id: string) => {
    setIsResending(id);
    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch('/api/messages/resend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ messageId: id })
      });
      const data = await response.json();
      if (data.success) {
        const responseLabel = data.wakeTriggered
          ? 'Message queued for resend and wake-up dispatched'
          : 'Message queued for resend';
        setFeedback({ message: responseLabel, type: 'success' });
      } else {
        setFeedback({ message: data.error || 'Failed to resend', type: 'error' });
      }
    } catch (error) {
      console.error("Error resending:", error);
      setFeedback({ message: 'Network error while resending', type: 'error' });
    } finally {
      setIsResending(null);
    }
  };

  const handleSendCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipient) return;
    
    setIsSending(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      let endpoint = '/api/messages/send';
      let payload: any = {
        recipient,
        ownerUid: auth.currentUser?.uid,
        channel: 'sms'
      };

      if (sendType === 'raw') {
        if (!body) throw new Error("Message body is required");
        payload.body = body;
      } else {
        if (!selectedTemplate) throw new Error("Template is required");
        endpoint = '/api/send-template';
        payload.templateName = selectedTemplate;
        // Basic variables parsing could go here, but we'll send empty variables for now
        payload.data = {};
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload)
      });
      
      const data = await response.json();
      if (data.success) {
        const outcome = data.pushed
          ? 'Message pushed to live device'
          : data.wakeTriggered
            ? 'Message queued and device wake-up triggered'
            : 'Message queued successfully';
        setFeedback({ message: outcome, type: 'success' });
        setIsSendModalOpen(false);
        setRecipient('');
        setBody('');
      } else {
        throw new Error(data.error || 'Failed to send message');
      }
    } catch (error: any) {
      console.error("Error sending custom message:", error);
      setFeedback({ message: error.message || 'Failed to send message', type: 'error' });
    } finally {
      setIsSending(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
      case 'queued': return 'text-slate-500';
      case 'processing': return 'text-amber-500';
      case 'sent': return 'text-blue-500';
      case 'delivered': return 'text-emerald-500';
      case 'failed': return 'text-red-500';
      default: return 'text-slate-500';
    }
  };

  return (
    <div className="p-6 enterprise-card relative">
      {/* Feedback Toast */}
      {feedback && (
        <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-2xl shadow-2xl animate-in slide-in-from-bottom duration-300 flex items-center gap-3 border ${
          feedback.type === 'success' ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-red-600 border-red-500 text-white'
        }`}>
          <span className="font-bold text-sm">{feedback.message}</span>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <p className="section-kicker">Message Control</p>
          <h2 className="section-heading">Message Tracking</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button 
            onClick={() => setIsSendModalOpen(true)} 
            className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 flex items-center gap-2 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" /> Send Message
          </button>
          <select value={filter} onChange={(e) => setFilter(e.target.value as any)} className="px-3 py-2 rounded-xl border border-slate-200 text-sm font-bold bg-slate-50">
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="queued">Queued</option>
            <option value="processing">Processing</option>
            <option value="sent">Sent</option>
            <option value="delivered">Delivered</option>
            <option value="failed">Failed</option>
          </select>
          <button
            onClick={clearAll}
            disabled={isClearing || filteredMessages.length === 0}
            className="px-3 py-2 rounded-xl bg-red-50 text-red-600 text-sm font-bold hover:bg-red-100 transition-colors disabled:opacity-50"
          >
            {isClearing ? 'Clearing...' : 'Clear View'}
          </button>
        </div>
      </div>

      <div className="divide-y divide-slate-100">
        {filteredMessages.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-sm font-medium">No messages found.</div>
        ) : (
          filteredMessages.map(msg => (
            <div key={msg.id} className="py-4 flex items-center justify-between hover:bg-slate-50 px-2 rounded-xl transition-colors">
              <div className="flex items-center gap-4 cursor-pointer flex-1" onClick={() => setSelectedMessage(msg)}>
                <div className={getStatusColor(msg.status)}>
                  {(msg.status === 'pending' || msg.status === 'queued') && <Clock className="w-5 h-5 opacity-50" />}
                  {msg.status === 'processing' && <Clock className="w-5 h-5" />}
                  {msg.status === 'sent' && <Send className="w-5 h-5" />}
                  {msg.status === 'delivered' && <CheckCircle2 className="w-5 h-5" />}
                  {msg.status === 'failed' && <AlertCircle className="w-5 h-5" />}
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">{msg.recipient || 'Unknown Recipient'}</p>
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-slate-500 capitalize">{msg.status}</p>
                    {msg.retryCount ? (
                      <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold">Retries: {msg.retryCount}</span>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => setSelectedMessage(msg)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="View Details"><Eye className="w-4 h-4" /></button>
                
                {/* Resend Button - Only show if not already successfully sent */}
                {msg.status !== 'sent' && msg.status !== 'delivered' && (
                  <button 
                    onClick={() => handleResend(msg.id)} 
                    disabled={isResending === msg.id}
                    className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-50"
                    title="Force Resend"
                  >
                    {isResending === msg.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  </button>
                )}
                
	                <button onClick={() => deleteMessage(msg.id)} disabled={isDeleting === msg.id} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50" title="Delete">{isDeleting === msg.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}</button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Message Preview Modal */}
      {selectedMessage && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="enterprise-card p-6 sm:p-8 max-w-md w-full space-y-4 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-black text-slate-900">Message Details</h3>
              <button onClick={() => setSelectedMessage(null)} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Recipient</p>
                <p className="text-sm font-medium text-slate-900">{selectedMessage.recipient}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Status</p>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-bold capitalize ${getStatusColor(selectedMessage.status)}`}>{selectedMessage.status}</span>
                  {selectedMessage.retryCount ? <span className="text-xs text-slate-500">(Retried {selectedMessage.retryCount} times)</span> : null}
                </div>
                {selectedMessage.deliveredAt && (
                  <p className="text-xs text-slate-500 mt-1">
                    Delivered at: {selectedMessage.deliveredAt.toDate ? selectedMessage.deliveredAt.toDate().toLocaleString() : new Date(selectedMessage.deliveredAt).toLocaleString()}
                  </p>
                )}
                {selectedMessage.error && (
                  <p className="text-xs text-red-600 mt-1 bg-red-50 p-2 rounded-lg border border-red-100">{selectedMessage.error}</p>
                )}
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Content</p>
                <div className="p-4 bg-slate-50 rounded-2xl text-sm text-slate-700 whitespace-pre-wrap border border-slate-100">
                  {selectedMessage.body || 'No content'}
                </div>
              </div>
            </div>
            <div className="pt-4 flex justify-end">
              {selectedMessage.status !== 'sent' && selectedMessage.status !== 'delivered' && (
                <button 
                  onClick={() => {
                    handleResend(selectedMessage.id);
                    setSelectedMessage(null);
                  }}
                  className="px-4 py-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 font-bold rounded-xl text-sm flex items-center gap-2 transition-colors"
                >
                  <RefreshCw className="w-4 h-4" /> Force Resend
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Send Custom Message Modal */}
      {isSendModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="enterprise-card p-6 sm:p-8 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black text-slate-900">Send Message</h3>
              <button onClick={() => setIsSendModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400"><X className="w-5 h-5" /></button>
            </div>
            
            <form onSubmit={handleSendCustom} className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Recipient Phone</label>
                <input
                  id="recipient"
                  name="recipient"
                  required
                  type="text"
                  placeholder="+1234567890"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5 transition-all text-sm font-bold placeholder:text-slate-300"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Message Source</label>
                <div className="flex p-1 bg-slate-100 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setSendType('raw')}
                    className={`flex-1 py-1.5 text-sm font-bold rounded-lg transition-all ${sendType === 'raw' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    Raw Text
                  </button>
                  <button
                    type="button"
                    onClick={() => setSendType('template')}
                    className={`flex-1 py-1.5 text-sm font-bold rounded-lg transition-all ${sendType === 'template' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    Template
                  </button>
                </div>
              </div>

              {sendType === 'raw' ? (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Message Body</label>
                  <textarea
                    id="messageBody"
                    name="messageBody"
                    required
                    rows={4}
                    placeholder="Type your message here..."
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5 transition-all text-sm resize-none"
                  />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Select Template</label>
                  <select
                    id="templateSelect"
                    name="templateSelect"
                    required
                    value={selectedTemplate}
                    onChange={(e) => {
                      setSelectedTemplate(e.target.value);
                      const t = templates.find(t => t.name === e.target.value);
                      if (t) setBody(t.body);
                    }}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5 transition-all text-sm font-bold"
                  >
                    <option value="" disabled>Choose a template...</option>
                    {templates.map(t => (
                      <option key={t.id} value={t.name}>{t.name}</option>
                    ))}
                  </select>
                  
                  {selectedTemplate && (
                    <div className="mt-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <p className="text-xs font-bold text-slate-400 mb-1">Preview:</p>
                      <p className="text-sm text-slate-600 italic">{body}</p>
                    </div>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={isSending}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm transition-all shadow-lg shadow-indigo-200 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                {isSending ? 'Sending...' : 'Send Message'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
