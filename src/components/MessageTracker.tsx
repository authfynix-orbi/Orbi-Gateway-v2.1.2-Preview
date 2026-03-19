import React, { useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  Eye,
  Loader2,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  Send,
  Trash2,
  X,
} from 'lucide-react';

interface MessageLog {
  id: string;
  status: 'pending' | 'queued' | 'processing' | 'sent' | 'delivered' | 'failed' | 'received';
  error?: string;
  timestamp: any;
  deliveredAt?: any;
  createdBy: string;
  body: string;
  recipient: string;
  retryCount?: number;
  direction?: 'inbound' | 'outbound';
  sender?: string;
  channel?: string;
  deviceId?: string;
}

interface Template {
  id: string;
  name: string;
  body: string;
}

type MessageStatus = MessageLog['status'] | 'all';

const statusOptions: MessageStatus[] = ['all', 'pending', 'queued', 'processing', 'sent', 'delivered', 'failed', 'received'];

export default function MessageTracker() {
  const [messages, setMessages] = useState<MessageLog[]>([]);
  const [filter, setFilter] = useState<MessageStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMessage, setSelectedMessage] = useState<MessageLog | null>(null);
  const [isResending, setIsResending] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [isSendModalOpen, setIsSendModalOpen] = useState(false);
  const [sendType, setSendType] = useState<'raw' | 'template'>('raw');
  const [recipient, setRecipient] = useState('');
  const [body, setBody] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (!db || !auth.currentUser) return;

    let unsubscribe: (() => void) | undefined;

    const setupListener = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', auth.currentUser!.uid));
        const isAdmin =
          (userDoc.exists() && userDoc.data().role === 'admin') ||
          (auth.currentUser?.email === 'auth.fynix@gmail.com' && auth.currentUser?.emailVerified === true);

        const q = isAdmin
          ? query(collection(db, 'message_logs'), orderBy('timestamp', 'desc'))
          : query(collection(db, 'message_logs'), where('createdBy', '==', auth.currentUser!.uid), orderBy('timestamp', 'desc'));

        unsubscribe = onSnapshot(
          q,
          (snapshot) => {
            const msgs = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as MessageLog));
            setMessages(msgs);
          },
          (error) => {
            console.error('MessageTracker: Error fetching messages:', error);
          },
        );
      } catch (error) {
        console.error('MessageTracker: Error setting up listener:', error);
      }
    };

    setupListener();

    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), 3000);
    return () => clearTimeout(timer);
  }, [feedback]);

  useEffect(() => {
    if (!db || !auth.currentUser || !isSendModalOpen) return;

    const fetchTemplates = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', auth.currentUser!.uid));
        const isAdmin =
          (userDoc.exists() && userDoc.data().role === 'admin') ||
          (auth.currentUser?.email === 'auth.fynix@gmail.com' && auth.currentUser?.emailVerified === true);
        const q = isAdmin
          ? query(collection(db, 'message_templates'), orderBy('name'))
          : query(collection(db, 'message_templates'), where('createdBy', '==', auth.currentUser!.uid), orderBy('name'));
        const snap = await getDocs(q);
        setTemplates(snap.docs.map((entry) => ({ id: entry.id, name: entry.data().name, body: entry.data().body })));
      } catch (error) {
        console.error('Error fetching templates:', error);
      }
    };

    fetchTemplates();
  }, [isSendModalOpen]);

  const filteredMessages = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    return messages.filter((message) => {
      const filterMatch = filter === 'all' || message.status === filter;
      if (!filterMatch) return false;
      if (!normalizedSearch) return true;
      const haystack = [
        message.id,
        message.recipient,
        message.sender,
        message.body,
        message.status,
        message.deviceId,
        message.direction,
        message.channel,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [messages, filter, searchQuery]);

  const summary = useMemo(
    () => ({
      total: filteredMessages.length,
      queued: filteredMessages.filter((entry) => entry.status === 'queued').length,
      delivered: filteredMessages.filter((entry) => entry.status === 'delivered').length,
      received: filteredMessages.filter((entry) => entry.status === 'received' || entry.direction === 'inbound').length,
    }),
    [filteredMessages],
  );

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

  const clearCurrentView = async () => {
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
        body: JSON.stringify({ messageIds: filteredMessages.map((message) => message.id) }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to clear messages');
      }
      setSelectedMessage(null);
      setFeedback({ message: `Deleted ${data.deletedCount || 0} messages`, type: 'success' });
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
        body: JSON.stringify({ messageId: id }),
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
      console.error('Error resending:', error);
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
      const payload: Record<string, any> = {
        recipient,
        ownerUid: auth.currentUser?.uid,
        channel: 'sms',
      };

      if (sendType === 'raw') {
        if (!body) throw new Error('Message body is required');
        payload.body = body;
      } else {
        if (!selectedTemplate) throw new Error('Template is required');
        endpoint = '/api/send-template';
        payload.templateName = selectedTemplate;
        payload.data = {};
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to send message');
      }

      const outcome = data.pushed
        ? 'Message pushed to live device'
        : data.wakeTriggered
          ? 'Message queued and device wake-up triggered'
          : 'Message queued successfully';
      setFeedback({ message: outcome, type: 'success' });
      setIsSendModalOpen(false);
      setRecipient('');
      setBody('');
      setSelectedTemplate('');
    } catch (error: any) {
      console.error('Error sending custom message:', error);
      setFeedback({ message: error.message || 'Failed to send message', type: 'error' });
    } finally {
      setIsSending(false);
    }
  };

  const exportCurrentView = async () => {
    const payload = filteredMessages.map((entry) => ({
      id: entry.id,
      recipient: entry.recipient,
      sender: entry.sender || null,
      status: entry.status,
      direction: entry.direction || null,
      channel: entry.channel || 'sms',
      deviceId: entry.deviceId || null,
      timestamp: formatTimestamp(entry.timestamp),
      deliveredAt: formatTimestamp(entry.deliveredAt),
      body: entry.body,
      error: entry.error || null,
    }));
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setFeedback({ message: 'Current message view copied as JSON', type: 'success' });
  };

  return (
    <div className="relative space-y-6">
      {feedback && (
        <div
          className={`fixed bottom-8 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-3 rounded-2xl border px-6 py-3 shadow-2xl ${
            feedback.type === 'success' ? 'border-emerald-500 bg-emerald-600 text-white' : 'border-red-500 bg-red-600 text-white'
          }`}
        >
          <span className="text-sm font-bold">{feedback.message}</span>
        </div>
      )}

      <div className="section-shell flex flex-col gap-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="section-kicker">Delivery Control</p>
            <h2 className="section-heading">Message Tracking</h2>
            <p className="section-subcopy">
              Review outbound queue state, received inbox traffic, and message body details from one cleaner command surface.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setIsSendModalOpen(true)} className="enterprise-button-primary">
              <Plus className="h-4 w-4" /> Send Message
            </button>
            <button
              onClick={exportCurrentView}
              disabled={filteredMessages.length === 0}
              className="enterprise-button-secondary disabled:opacity-50"
            >
              <Download className="h-4 w-4" /> Export View
            </button>
            <button
              onClick={clearCurrentView}
              disabled={isClearing || filteredMessages.length === 0}
              className="enterprise-button-secondary border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50"
            >
              {isClearing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Clear View
            </button>
          </div>
        </div>

        <div className="stat-grid">
          <MetricCard label="Visible" value={summary.total.toString()} tone="slate" />
          <MetricCard label="Queued" value={summary.queued.toString()} tone="amber" />
          <MetricCard label="Delivered" value={summary.delivered.toString()} tone="emerald" />
          <MetricCard label="Inbox" value={summary.received.toString()} tone="violet" />
        </div>

        <div className="flex flex-col gap-3 lg:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="message-search"
              name="messageSearch"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search by recipient, sender, status, device, body, or message ID"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm font-medium focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/5"
            />
          </div>
          <select
            id="message-status-filter"
            name="messageStatusFilter"
            value={filter}
            onChange={(event) => setFilter(event.target.value as MessageStatus)}
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold"
          >
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {status === 'all' ? 'All Statuses' : status.charAt(0).toUpperCase() + status.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="table-shell p-4 md:p-6">
        <div className="max-h-[68vh] overflow-y-auto pr-1">
          <div className="divide-y divide-slate-100">
            {filteredMessages.length === 0 ? (
              <div className="py-12 text-center text-sm font-medium text-slate-500">No messages found.</div>
            ) : (
              filteredMessages.map((message) => {
                const isInbound = message.direction === 'inbound' || message.status === 'received';
                return (
                <div
                  key={message.id}
                  className="rounded-[24px] border border-transparent px-3 py-4 transition-colors hover:border-slate-200 hover:bg-slate-50/80"
                >
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex cursor-pointer items-start gap-4 xl:flex-1" onClick={() => setSelectedMessage(message)}>
                      <div className={`mt-0.5 flex h-11 w-11 items-center justify-center rounded-2xl border ${statusToneShell(message.status)}`}>
                        {(message.status === 'pending' || message.status === 'queued') && <Clock className="h-5 w-5 opacity-70" />}
                        {message.status === 'processing' && <Clock className="h-5 w-5" />}
                        {message.status === 'sent' && <Send className="h-5 w-5" />}
                        {message.status === 'delivered' && <CheckCircle2 className="h-5 w-5" />}
                        {message.status === 'failed' && <AlertCircle className="h-5 w-5" />}
                        {message.status === 'received' && <MessageSquare className="h-5 w-5" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-bold text-slate-900">
                            {isInbound ? (message.sender || message.recipient || 'Unknown Sender') : (message.recipient || 'Unknown Recipient')}
                          </p>
                          <span className={`tone-chip ${statusToneChip(message.status)}`}>{message.status}</span>
                          {isInbound ? <span className="enterprise-pill enterprise-pill-neutral">Inbox</span> : null}
                          {message.retryCount ? <span className="enterprise-pill enterprise-pill-warning">Retries: {message.retryCount}</span> : null}
                          {message.channel ? <span className="enterprise-pill enterprise-pill-neutral uppercase">{message.channel}</span> : null}
                        </div>
                        <p className="mt-1 line-clamp-2 text-[13px] font-medium leading-6 text-slate-600">{message.body || 'No content'}</p>
                        <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-medium text-slate-500">
                          <span className="enterprise-pill enterprise-pill-neutral">Created: {formatTimestamp(message.timestamp)}</span>
                          {message.deliveredAt ? (
                            <span className="enterprise-pill enterprise-pill-neutral">Delivered: {formatTimestamp(message.deliveredAt)}</span>
                          ) : null}
                          {message.deviceId ? <span className="enterprise-pill enterprise-pill-neutral">Device: {message.deviceId}</span> : null}
                          <span className="enterprise-pill enterprise-pill-neutral">ID: {message.id.slice(0, 10)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-1 self-end xl:self-auto">
                      <button
                        onClick={() => setSelectedMessage(message)}
                        className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-indigo-50 hover:text-indigo-600"
                        title="View Details"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      {message.status !== 'sent' && message.status !== 'delivered' && (
                        <button
                          onClick={() => handleResend(message.id)}
                          disabled={isResending === message.id}
                          className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-emerald-50 hover:text-emerald-600 disabled:opacity-50"
                          title="Force Resend"
                        >
                          {isResending === message.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        </button>
                      )}
                      <button
                        onClick={() => deleteMessage(message.id)}
                        disabled={isDeleting === message.id}
                        className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                        title="Delete"
                      >
                        {isDeleting === message.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {selectedMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="enterprise-card max-h-[85vh] w-full max-w-5xl overflow-y-auto p-6 shadow-2xl sm:p-8">
            <div className="flex items-center justify-between">
              <h3 className="text-[16px] font-black text-slate-900">Message Details</h3>
              <button onClick={() => setSelectedMessage(null)} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
              <div className="min-w-0">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Content</p>
                  <button
                    onClick={() => navigator.clipboard.writeText(selectedMessage.body || '')}
                    className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700"
                  >
                    <Copy className="h-3.5 w-3.5" /> Copy
                  </button>
                </div>
                <div className="min-h-[260px] rounded-2xl border border-slate-100 bg-slate-50 p-5 text-sm leading-7 text-slate-700 whitespace-pre-wrap">
                  {selectedMessage.body || 'No content'}
                </div>
              </div>

              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                  <DetailField
                    label={selectedMessage.direction === 'inbound' || selectedMessage.status === 'received' ? 'Sender' : 'Recipient'}
                    value={
                      selectedMessage.direction === 'inbound' || selectedMessage.status === 'received'
                        ? (selectedMessage.sender || selectedMessage.recipient || 'Unknown Sender')
                        : (selectedMessage.recipient || 'Unknown Recipient')
                    }
                  />
                  <DetailField label="Status" value={selectedMessage.status} tone={statusTextTone(selectedMessage.status)} />
                  <DetailField label="Direction" value={selectedMessage.direction || (selectedMessage.status === 'received' ? 'inbound' : 'outbound')} />
                  <DetailField label="Created" value={formatTimestamp(selectedMessage.timestamp)} />
                  <DetailField label="Delivered" value={formatTimestamp(selectedMessage.deliveredAt)} />
                  <DetailField label="Device" value={selectedMessage.deviceId || 'Unassigned'} />
                  <DetailField label="Channel" value={selectedMessage.channel || 'sms'} />
                  <DetailField label="Message ID" value={selectedMessage.id} />
                </div>

                {selectedMessage.error && (
                  <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">{selectedMessage.error}</div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-5">
              {selectedMessage.status !== 'sent' && selectedMessage.status !== 'delivered' && (
                <button
                  onClick={() => handleResend(selectedMessage.id)}
                  className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-600 transition-colors hover:bg-emerald-100"
                >
                  <RefreshCw className="h-4 w-4" /> Force Resend
                </button>
              )}
              <button
                onClick={() => deleteMessage(selectedMessage.id)}
                className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-2 text-sm font-bold text-red-600 transition-colors hover:bg-red-100"
              >
                <Trash2 className="h-4 w-4" /> Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {isSendModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="enterprise-card max-w-md w-full p-6 shadow-2xl sm:p-8">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-[16px] font-black text-slate-900">Send Message</h3>
              <button onClick={() => setIsSendModalOpen(false)} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSendCustom} className="space-y-5">
              <div className="space-y-1.5">
                <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-slate-400">Recipient Phone</label>
                <input
                  id="send-recipient"
                  name="recipient"
                  required
                  type="text"
                  placeholder="+1234567890"
                  value={recipient}
                  onChange={(event) => setRecipient(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold transition-all placeholder:text-slate-300 focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/5"
                />
              </div>

              <div className="space-y-1.5">
                <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-slate-400">Message Source</label>
                <div className="flex rounded-xl bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => setSendType('raw')}
                    className={`flex-1 rounded-lg py-1.5 text-sm font-bold transition-all ${sendType === 'raw' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    Raw Text
                  </button>
                  <button
                    type="button"
                    onClick={() => setSendType('template')}
                    className={`flex-1 rounded-lg py-1.5 text-sm font-bold transition-all ${sendType === 'template' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    Template
                  </button>
                </div>
              </div>

              {sendType === 'raw' ? (
                <div className="space-y-1.5">
                  <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-slate-400">Message Body</label>
                  <textarea
                    id="send-body"
                    name="messageBody"
                    required
                    rows={4}
                    placeholder="Type your message here..."
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm transition-all focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/5"
                  />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-slate-400">Select Template</label>
                  <select
                    id="message-template"
                    name="templateSelect"
                    required
                    value={selectedTemplate}
                    onChange={(event) => {
                      setSelectedTemplate(event.target.value);
                      const template = templates.find((entry) => entry.name === event.target.value);
                      if (template) setBody(template.body);
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold transition-all focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/5"
                  >
                    <option value="" disabled>
                      Choose a template...
                    </option>
                    {templates.map((template) => (
                      <option key={template.id} value={template.name}>
                        {template.name}
                      </option>
                    ))}
                  </select>

                  {selectedTemplate && (
                    <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
                      <p className="mb-1 text-xs font-bold text-slate-400">Preview:</p>
                      <p className="text-sm italic text-slate-600">{body}</p>
                    </div>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={isSending}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-200 transition-all hover:bg-indigo-700 disabled:opacity-50"
              >
                {isSending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                {isSending ? 'Sending...' : 'Send Message'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, tone }: { label: string; value: string; tone: 'slate' | 'amber' | 'emerald' | 'violet' }) {
  const toneMap: Record<string, string> = {
    slate: 'border-slate-200 bg-slate-50 text-slate-800',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    violet: 'border-violet-200 bg-violet-50 text-violet-800',
  };

  return (
    <div className={`rounded-[24px] border p-4 shadow-sm ${toneMap[tone]}`}>
      <p className="text-[11px] font-black uppercase tracking-widest">{label}</p>
      <p className="mt-2 text-[24px] font-black tracking-tight">{value}</p>
    </div>
  );
}

function DetailField({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className={`mt-2 break-all text-sm font-bold ${tone || 'text-slate-900'}`}>{value}</p>
    </div>
  );
}

function formatTimestamp(timestamp: any) {
  const date = timestamp?.toDate?.() || (timestamp ? new Date(timestamp) : null);
  if (!date || Number.isNaN(date.getTime())) {
    return 'Not available';
  }
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

function statusToneChip(status: MessageLog['status']) {
  switch (status) {
    case 'pending':
    case 'queued':
      return 'tone-chip-slate';
    case 'processing':
      return 'tone-chip-amber';
    case 'sent':
      return 'tone-chip-indigo';
    case 'delivered':
      return 'tone-chip-emerald';
    case 'failed':
      return 'tone-chip-rose';
    case 'received':
      return 'tone-chip-cyan';
    default:
      return 'tone-chip-slate';
  }
}

function statusToneShell(status: MessageLog['status']) {
  switch (status) {
    case 'pending':
    case 'queued':
      return 'border-slate-200 bg-slate-50 text-slate-500';
    case 'processing':
      return 'border-amber-200 bg-amber-50 text-amber-600';
    case 'sent':
      return 'border-indigo-200 bg-indigo-50 text-indigo-600';
    case 'delivered':
      return 'border-emerald-200 bg-emerald-50 text-emerald-600';
    case 'failed':
      return 'border-rose-200 bg-rose-50 text-rose-600';
    case 'received':
      return 'border-cyan-200 bg-cyan-50 text-cyan-600';
    default:
      return 'border-slate-200 bg-slate-50 text-slate-500';
  }
}

function statusTextTone(status: MessageLog['status']) {
  switch (status) {
    case 'pending':
    case 'queued':
      return 'text-slate-500';
    case 'processing':
      return 'text-amber-600';
    case 'sent':
      return 'text-indigo-600';
    case 'delivered':
      return 'text-emerald-600';
    case 'failed':
      return 'text-rose-600';
    case 'received':
      return 'text-cyan-600';
    default:
      return 'text-slate-500';
  }
}
