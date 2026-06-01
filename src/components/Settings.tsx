import React, { useEffect, useMemo, useState } from 'react';
import { auth, db } from '../firebase';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  KeyRound,
  Plus,
  RefreshCw,
  ShieldAlert,
  Trash2,
  UserCircle2,
  XCircle,
} from 'lucide-react';

type CredentialRecord = {
  id: string;
  ownerUid: string;
  ownerEmail: string | null;
  name: string;
  keyPrefix: string | null;
  scopes: string[];
  status: string;
  createdAt: any;
  lastUsedAt: any;
  revokedAt: any;
};

export default function Settings() {
  const [isResetting, setIsResetting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [status, setStatus] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [credentials, setCredentials] = useState<CredentialRecord[]>([]);
  const [loadingCredentials, setLoadingCredentials] = useState(true);
  const [creatingCredential, setCreatingCredential] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [newCredentialName, setNewCredentialName] = useState('Production Backend');
  const [latestSecret, setLatestSecret] = useState<string | null>(null);

  const currentUser = auth.currentUser;
  const ownerUid = currentUser?.uid || '';
  const ownerEmail = currentUser?.email || '';

  const sampleTemplatePayload = useMemo(
    () =>
      JSON.stringify(
        {
          templateName: 'OTP_Message',
          recipient: '+255764258114',
          data: {
            otp: '123456',
            androidHash: 'F06swEpWoT9',
          },
          channel: 'sms',
          language: 'en',
          messageType: 'transactional',
          requestId: 'otp-20260318-0001',
        },
        null,
        2,
      ),
    [],
  );

  const sampleCurl = useMemo(
    () => `curl -X POST https://talk.orbifinancial.com/api/send-template \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: $ORBI_TALK_GATEWAY_API_KEY" \\
  -d '${sampleTemplatePayload.replace(/'/g, "'\\''")}'`,
    [sampleTemplatePayload],
  );

  useEffect(() => {
    loadCredentials();
  }, []);

  const loadCredentials = async () => {
    if (!currentUser) {
      setCredentials([]);
      setLoadingCredentials(false);
      return;
    }

    setLoadingCredentials(true);
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch('/api/api-credentials', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load API credentials');
      }
      setCredentials(payload.credentials || []);
    } catch (error: any) {
      console.error('Failed to load API credentials:', error);
      setStatus({ message: error.message || 'Failed to load API credentials.', type: 'error' });
    } finally {
      setLoadingCredentials(false);
    }
  };

  const handleCreateCredential = async () => {
    if (!currentUser) return;
    setCreatingCredential(true);
    setStatus(null);
    setLatestSecret(null);

    try {
      const token = await currentUser.getIdToken();
      const response = await fetch('/api/api-credentials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: newCredentialName.trim() || 'External Integration',
          scopes: ['send_template', 'send_sms', 'send_email'],
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to create API credential');
      }

      setLatestSecret(payload.apiKey);
      setStatus({ message: 'API key created. Copy it now; it will not be shown again.', type: 'success' });
      await loadCredentials();
    } catch (error: any) {
      console.error('Failed to create API credential:', error);
      setStatus({ message: error.message || 'Failed to create API credential.', type: 'error' });
    } finally {
      setCreatingCredential(false);
    }
  };

  const handleRevokeCredential = async (credentialId: string) => {
    if (!currentUser) return;
    setRevokingId(credentialId);
    setStatus(null);

    try {
      const token = await currentUser.getIdToken();
      const response = await fetch(`/api/api-credentials/${credentialId}/revoke`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to revoke API credential');
      }

      setStatus({ message: 'API key revoked successfully.', type: 'success' });
      await loadCredentials();
    } catch (error: any) {
      console.error('Failed to revoke API credential:', error);
      setStatus({ message: error.message || 'Failed to revoke API credential.', type: 'error' });
    } finally {
      setRevokingId(null);
    }
  };

  const handleResetServer = async () => {
    setIsResetting(true);
    setStatus(null);

    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch('/api/admin/reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Failed to reset server');
      }

      setStatus({
        message: `Server reset successful. ${payload.totalDeleted ?? 0} documents cleared. Gateway is now fresh.`,
        type: 'success',
      });
      setShowConfirm(false);
    } catch (error) {
      console.error('Reset failed:', error);
      setStatus({ message: 'Failed to reset server. Check permissions.', type: 'error' });
    } finally {
      setIsResetting(false);
    }
  };

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setStatus({ message: `${label} copied to clipboard.`, type: 'success' });
    } catch (error) {
      console.error(`Failed to copy ${label}:`, error);
      setStatus({ message: `Failed to copy ${label}.`, type: 'error' });
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-6 py-8 md:px-8">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-slate-900">System Settings</h1>
        <p className="font-medium text-slate-500">
          Manage ownership metadata, backend API credentials, ORBI Core connection rules, and administrative actions.
        </p>
      </div>

      {status && (
        <div
          className={`flex items-center gap-4 rounded-[2rem] border p-6 ${
            status.type === 'success'
              ? 'border-emerald-100 bg-emerald-50 text-emerald-800'
              : 'border-red-100 bg-red-50 text-red-800'
          }`}
        >
          {status.type === 'success' ? <CheckCircle2 className="h-6 w-6" /> : <AlertTriangle className="h-6 w-6" />}
          <p className="text-sm font-bold">{status.message}</p>
        </div>
      )}

      <div className="grid gap-8 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="space-y-8">
          <div className="enterprise-card enterprise-card-strong overflow-hidden">
            <div className="border-b border-slate-200 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(239,246,255,0.92))] px-8 py-6">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700">
                  <UserCircle2 className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-xl font-black tracking-tight text-slate-950">Ownership Identity</h2>
                  <p className="text-sm font-medium text-slate-600">
                    Templates, devices, messages, and API credentials all route under this user identity.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-6 p-8">
              <IdentityField
                label="Assigned Owner UID"
                value={ownerUid || 'Unavailable'}
                helper="Canonical internal ownership key for templates, devices, messages, and access credentials."
                onCopy={ownerUid ? () => copyText(ownerUid, 'Owner UID') : undefined}
              />
              <IdentityField
                label="Assigned Owner Email"
                value={ownerEmail || 'Unavailable'}
                helper="Convenience alias for external systems. Backend resolves it to the canonical owner UID."
                onCopy={ownerEmail ? () => copyText(ownerEmail, 'Owner email') : undefined}
              />
            </div>
          </div>

          <div className="enterprise-card enterprise-card-strong overflow-hidden">
            <div className="border-b border-slate-200 bg-slate-50 px-8 py-6">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white">
                  <KeyRound className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-xl font-black tracking-tight text-slate-950">External API Credentials</h2>
                  <p className="text-sm font-medium text-slate-600">
                    Generate per-user API keys for third-party systems. Each key is owned, auditable, and revocable.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-6 p-8">
              <div className="grid gap-4 md:grid-cols-[1fr_auto]">
                <input
                  value={newCredentialName}
                  onChange={(event) => setNewCredentialName(event.target.value)}
                  className="enterprise-input"
                  placeholder="Credential label"
                />
                <button
                  onClick={handleCreateCredential}
                  disabled={creatingCredential}
                  className="enterprise-button-primary px-6 py-3 disabled:opacity-50"
                >
                  {creatingCredential ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Create Key
                </button>
              </div>

              {latestSecret && (
                <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-700">Copy Once</p>
                      <p className="mt-2 break-all text-sm font-black text-emerald-950">{latestSecret}</p>
                      <p className="mt-2 text-sm font-medium text-emerald-800">
                        This raw secret is only shown once. Store it in the external service immediately.
                      </p>
                    </div>
                    <button onClick={() => copyText(latestSecret, 'API key')} className="enterprise-pill enterprise-pill-neutral">
                      <Copy className="h-3.5 w-3.5" />
                      Copy
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">Issued Credentials</p>
                  {loadingCredentials && <RefreshCw className="h-4 w-4 animate-spin text-slate-400" />}
                </div>

                {credentials.length === 0 && !loadingCredentials ? (
                  <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-6 text-sm font-medium text-slate-600">
                    No API credentials created yet.
                  </div>
                ) : (
                  credentials.map((credential) => (
                    <div key={credential.id} className="rounded-3xl border border-slate-200 bg-white p-5">
                      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-black text-slate-950">{credential.name}</p>
                            <span className={`tone-chip ${credential.status === 'active' ? 'tone-chip-emerald' : 'tone-chip-rose'}`}>
                              {credential.status}
                            </span>
                          </div>
                          <p className="text-xs font-bold text-slate-500">Prefix: {credential.keyPrefix || 'n/a'}</p>
                          <p className="text-xs font-medium text-slate-500">
                            Scopes: {credential.scopes.length > 0 ? credential.scopes.join(', ') : 'none'}
                          </p>
                          <p className="text-xs font-medium text-slate-500">
                            Last used: {formatTimestamp(credential.lastUsedAt)}
                          </p>
                        </div>
                        <button
                          onClick={() => handleRevokeCredential(credential.id)}
                          disabled={credential.status !== 'active' || revokingId === credential.id}
                          className="enterprise-button-secondary px-5 py-3 text-red-700 disabled:opacity-50"
                        >
                          {revokingId === credential.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                          Revoke
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="enterprise-card enterprise-card-strong overflow-hidden">
            <div className="border-b border-slate-200 bg-slate-50 px-8 py-6">
              <h2 className="text-xl font-black tracking-tight text-slate-950">Third-Party Request Contract</h2>
              <p className="text-sm font-medium text-slate-600">
                External systems authenticate with `x-api-key`. Ownership is derived from the issued key, not from the body.
              </p>
            </div>

            <div className="space-y-5 p-8">
              <div className="grid gap-4 md:grid-cols-3">
                <RuleCard
                  title="Public host"
                  detail="Use https://talk.orbifinancial.com as the canonical ORBI Talk Gateway URL."
                />
                <RuleCard
                  title="Core env"
                  detail="Set ORBI_TALK_GATEWAY_URL and ORBI_TALK_GATEWAY_API_KEY on ORBI Core only."
                />
                <RuleCard
                  title="Secret boundary"
                  detail="Never place Talk Gateway API keys in mobile apps, browser UI, logs, or templates."
                />
              </div>

              <div className="rounded-3xl border border-slate-200 bg-slate-950 p-6 text-slate-100">
                <div className="mb-4 flex items-center justify-between">
                  <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">
                    POST /api/send-template
                  </p>
                  <button
                    onClick={() => copyText(sampleTemplatePayload, 'Sample payload')}
                    className="enterprise-pill enterprise-pill-neutral border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copy JSON
                  </button>
                </div>
                <pre className="overflow-x-auto whitespace-pre-wrap break-all text-xs leading-6 text-slate-200">
                  {sampleTemplatePayload}
                </pre>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-slate-950 p-6 text-slate-100">
                <div className="mb-4 flex items-center justify-between">
                  <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">
                    ORBI Core server-side call
                  </p>
                  <button
                    onClick={() => copyText(sampleCurl, 'cURL example')}
                    className="enterprise-pill enterprise-pill-neutral border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copy cURL
                  </button>
                </div>
                <pre className="overflow-x-auto whitespace-pre-wrap break-all text-xs leading-6 text-slate-200">
                  {sampleCurl}
                </pre>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <RuleCard
                  title="x-api-key"
                  detail="Required for external requests. Backend resolves owner identity from issued credentials or trusted Core configuration."
                />
                <RuleCard
                  title="requestId"
                  detail="Recommended correlation/idempotency key. Reuse it safely on retries."
                />
                <RuleCard
                  title="deviceId"
                  detail="Optional hard route for a specific owned relay. Ownership is still enforced server-side."
                />
              </div>

              <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-amber-700">
                  Trusted Infrastructure Key
                </p>
                <p className="mt-3 text-sm font-medium leading-6 text-amber-900">
                  The server-only <code>ORBI_TALK_GATEWAY_API_KEY</code> is treated as a trusted system credential, not
                  as a user owner. When that master key is used, the request must still include <code>ownerUid</code>,
                  <code>ownerEmail</code>, or <code>deviceId</code> so the backend can attach the message to the correct owner.
                </p>
              </div>

              <div className="rounded-3xl border border-cyan-200 bg-cyan-50 p-5">
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-cyan-700">
                  Production rollout guidance
                </p>
                <div className="mt-3 grid gap-3 text-sm font-medium leading-6 text-cyan-950 md:grid-cols-2">
                  <p>Use templates for OTP, transaction, support, and compliance messages.</p>
                  <p>Always pass <code>requestId</code> from ORBI Core for retry safety.</p>
                  <p>Keep one online relay before enabling SMS traffic for an owner.</p>
                  <p>Investigate pending or failed queues before rotating credentials.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-8">
          <div className="rounded-[2.5rem] bg-slate-900 p-8 text-white shadow-[0_24px_60px_rgba(15,23,42,0.22)]">
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
                  <RefreshCw className="h-6 w-6 text-indigo-300" />
                </div>
                <div>
                  <h3 className="text-xl font-black tracking-tight">Infrastructure Status</h3>
                  <p className="text-xs font-medium text-slate-400">Per-user API credentials with server-side ownership enforcement</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <InfraTile label="Identity" value="Resolved from API key" />
                <InfraTile label="Storage" value="Hashed secrets only" />
                <InfraTile label="Rotation" value="Create and revoke" />
                <InfraTile label="Audit" value="Last-used tracking" />
              </div>
            </div>
          </div>

          <div className="enterprise-card border-red-100 overflow-hidden">
            <div className="flex items-center gap-3 border-b border-red-100 bg-red-50 px-8 py-4">
              <ShieldAlert className="h-5 w-5 text-red-600" />
              <span className="text-xs font-black uppercase tracking-widest text-red-600">Danger Zone</span>
            </div>

            <div className="space-y-6 p-8">
              <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
                <div className="space-y-1">
                  <h3 className="text-lg font-black text-slate-900">Reset ORBI Talk Gateway Server</h3>
                  <p className="max-w-md text-sm text-slate-500">
                    This will permanently delete all messages, registered relay devices, and templates from the database.
                    This action cannot be undone.
                  </p>
                </div>
                <button
                  onClick={() => setShowConfirm(true)}
                  className="flex items-center gap-2 rounded-2xl bg-red-600 px-8 py-4 text-xs font-black uppercase tracking-widest text-white shadow-xl shadow-red-100 transition-all hover:bg-red-700 active:scale-95"
                >
                  <Trash2 className="h-4 w-4" />
                  Hard Flash Server
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4 backdrop-blur-md">
          <div className="enterprise-card w-full max-w-md space-y-8 p-10 shadow-2xl">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-red-50">
              <AlertTriangle className="h-10 w-10 text-red-600" />
            </div>
            <div className="space-y-2 text-center">
              <h2 className="text-2xl font-black tracking-tight text-slate-900">Are you absolutely sure?</h2>
              <p className="text-sm font-medium text-slate-500">
                This will wipe all data from ORBI Talk Gateway. This action is irreversible and will disconnect all active relay devices.
              </p>
            </div>
            <div className="space-y-3">
              <button
                onClick={handleResetServer}
                disabled={isResetting}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-red-600 py-4 text-xs font-black uppercase tracking-widest text-white shadow-xl shadow-red-100 transition-all hover:bg-red-700 disabled:opacity-50"
              >
                {isResetting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {isResetting ? 'Flashing Database...' : 'Yes, Reset Everything'}
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                disabled={isResetting}
                className="w-full rounded-2xl bg-slate-100 py-4 text-xs font-black uppercase tracking-widest text-slate-600 transition-all hover:bg-slate-200 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function IdentityField({
  label,
  value,
  helper,
  onCopy,
}: {
  label: string;
  value: string;
  helper: string;
  onCopy?: () => void;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">{label}</p>
          <p className="break-all text-sm font-black text-slate-950 md:text-base">{value}</p>
          <p className="text-sm font-medium leading-6 text-slate-600">{helper}</p>
        </div>
        {onCopy && (
          <button onClick={onCopy} className="enterprise-pill enterprise-pill-neutral">
            <Copy className="h-3.5 w-3.5" />
            Copy
          </button>
        )}
      </div>
    </div>
  );
}

function RuleCard({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5">
      <p className="text-sm font-black text-slate-900">{title}</p>
      <p className="mt-2 text-sm font-medium leading-6 text-slate-600">{detail}</p>
    </div>
  );
}

function InfraTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
      <p className="text-sm font-bold">{value}</p>
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
