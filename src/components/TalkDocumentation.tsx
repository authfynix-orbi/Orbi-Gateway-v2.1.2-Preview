import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Code2,
  Copy,
  KeyRound,
  Lock,
  Mail,
  RadioTower,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  TerminalSquare,
  Webhook,
} from 'lucide-react';

type DocSlide = {
  id: string;
  eyebrow: string;
  title: string;
  summary: string;
  icon: React.ElementType;
  accent: string;
  body: React.ReactNode;
};

const talkBaseUrl = 'https://talk.orbifinancial.com';

const templatePayload = JSON.stringify(
  {
    templateName: 'transaction_success',
    recipient: '+255764258114',
    channel: 'sms',
    language: 'en',
    messageType: 'transactional',
    requestId: 'tx-msg-20260531-0001',
    ownerUid: 'relay-owner-firebase-uid',
    data: {
      customerName: 'Amina',
      amount: '25,000 TZS',
      reference: 'ORBI-TX-8842',
    },
  },
  null,
  2,
);

const templateRecord = JSON.stringify(
  {
    name: 'transaction_success',
    channel: 'sms',
    language: 'en',
    messageType: 'transactional',
    body:
      'Hi {{customerName}}, your ORBI transaction {{reference}} for {{amount}} is complete. Thank you for using ORBI.',
    components: [],
    status: 'active',
    createdBy: 'relay-owner-firebase-uid',
  },
  null,
  2,
);

const templateRenderExample = JSON.stringify(
  {
    inputVariables: {
      customerName: 'Amina',
      amount: '25,000 TZS',
      reference: 'ORBI-TX-8842',
    },
    renderedSms:
      'Hi Amina, your ORBI transaction ORBI-TX-8842 for 25,000 TZS is complete. Thank you for using ORBI.',
  },
  null,
  2,
);

const directPayload = JSON.stringify(
  {
    recipient: '+255764258114',
    body: 'Your ORBI transaction ORBI-TX-8842 has been completed.',
    channel: 'sms',
    messageType: 'transactional',
    requestId: 'direct-sms-20260531-0001',
    ownerUid: 'relay-owner-firebase-uid',
  },
  null,
  2,
);

const emailTemplatePayload = JSON.stringify(
  {
    templateName: 'account_statement_ready',
    recipient: 'amina@example.com',
    channel: 'email',
    language: 'en',
    messageType: 'transactional',
    requestId: 'email-statement-20260601-0001',
    ownerUid: 'relay-owner-firebase-uid',
    data: {
      customerName: 'Amina',
      month: 'May 2026',
      downloadUrl: 'https://portal.orbifinancial.com/statements/secure-link',
    },
  },
  null,
  2,
);

const directEmailPayload = JSON.stringify(
  {
    recipient: 'amina@example.com',
    subject: 'Your ORBI statement is ready',
    body: 'Hi Amina, your May 2026 ORBI statement is ready for secure download.',
    channel: 'email',
    messageType: 'transactional',
    requestId: 'direct-email-20260601-0001',
    ownerUid: 'relay-owner-firebase-uid',
  },
  null,
  2,
);

const pairingPayload = JSON.stringify(
  {
    serverUrl: 'wss://talk.orbifinancial.com',
    ownerUid: 'relay-owner-firebase-uid',
    deviceId: 'orbi-talk-relay-01',
    model: 'Samsung A11',
    permissions: ['sms_send', 'sms_read', 'foreground_service', 'background_data'],
  },
  null,
  2,
);

const curlTemplate = `curl -X POST ${talkBaseUrl}/api/send-template \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: $ORBI_TALK_GATEWAY_API_KEY" \\
  -d '${templatePayload.replace(/'/g, "'\\''")}'`;

const curlForceQueue = `curl -X POST ${talkBaseUrl}/api/messages/force-resend-queue \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $FIREBASE_ID_TOKEN" \\
  -d '{"includeFailed":true,"limit":250}'`;

const curlEmailTemplate = `curl -X POST ${talkBaseUrl}/api/send-template \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: $ORBI_TALK_GATEWAY_API_KEY" \\
  -d '${emailTemplatePayload.replace(/'/g, "'\\''")}'`;

function CodeBlock({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-slate-950 shadow-[0_18px_38px_rgba(15,23,42,0.12)]">
      <div className="flex items-center justify-between border-b border-white/10 bg-white/5 px-4 py-3">
        <span className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-200">{label}</span>
        <button
          onClick={copy}
          className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-white/15"
        >
          {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="max-h-[420px] overflow-auto p-5 text-[12px] leading-6 text-slate-100">
        <code>{value}</code>
      </pre>
    </div>
  );
}

function MiniCard({ title, detail, icon: Icon }: { title: string; detail: string; icon: React.ElementType }) {
  return (
    <div className="rounded-[22px] border border-slate-200 bg-white/85 p-5 shadow-sm">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
        <Icon className="h-5 w-5" />
      </div>
      <h4 className="text-sm font-black text-slate-900">{title}</h4>
      <p className="mt-2 text-[13px] font-medium leading-6 text-slate-600">{detail}</p>
    </div>
  );
}

export default function TalkDocumentation() {
  const slides: DocSlide[] = useMemo(
    () => [
      {
        id: 'architecture',
        eyebrow: 'Slide 01',
        title: 'How ORBI Talk Gateway fits into the platform',
        summary:
          'ORBI Core sends trusted communication jobs to ORBI Talk. ORBI Talk stores the job, selects an owned Android relay, and delivers SMS through the device.',
        icon: RadioTower,
        accent: 'from-cyan-500 to-blue-600',
        body: (
          <div className="grid gap-4 lg:grid-cols-3">
            <MiniCard
              icon={ShieldCheck}
              title="ORBI Core"
              detail="Owns financial truth, transaction events, template decisions, and trusted server-side credentials."
            />
            <MiniCard
              icon={RadioTower}
              title="ORBI Talk Gateway"
              detail="Receives API jobs, renders templates, queues SMS tasks, tracks status, and dispatches work to online relay devices."
            />
            <MiniCard
              icon={Smartphone}
              title="Android Relay App"
              detail="Pairs with the gateway through WSS, receives queued SMS work, sends through the SIM, and reports delivery status."
            />
          </div>
        ),
      },
      {
        id: 'auth',
        eyebrow: 'Slide 02',
        title: 'Authentication and secret usage',
        summary:
          'Use scoped API keys for server-to-server integrations. Never ship API keys inside mobile apps, browser bundles, QR codes, templates, or logs.',
        icon: KeyRound,
        accent: 'from-emerald-500 to-teal-700',
        body: (
          <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-4">
              <MiniCard
                icon={KeyRound}
                title="Header"
                detail="Send x-api-key: $ORBI_TALK_GATEWAY_API_KEY from trusted backend services only."
              />
              <MiniCard
                icon={Lock}
                title="Scopes"
                detail="Use send_template for approved templates and send_sms for direct SMS. Revoke keys immediately when rotated."
              />
            </div>
            <CodeBlock
              label="Production env"
              value={`ORBI_TALK_GATEWAY_URL=https://talk.orbifinancial.com
ORBI_TALK_GATEWAY_API_KEY=otg_live_xxxxxxxxxxxxxxxxx
ORBI_TALK_GATEWAY_USER_ID=<firebase-owner-uid>
ORBI_TALK_GATEWAY_USER_EMAIL=ops@orbifinancial.com`}
            />
          </div>
        ),
      },
      {
        id: 'send-template',
        eyebrow: 'Slide 03',
        title: 'Template message API',
        summary:
          'Recommended production path. Templates keep transaction, OTP, account, and support messages consistent and auditable.',
        icon: ClipboardList,
        accent: 'from-blue-500 to-indigo-700',
        body: (
          <div className="grid gap-5 xl:grid-cols-2">
            <CodeBlock label="POST /api/send-template payload" value={templatePayload} />
            <CodeBlock label="cURL" value={curlTemplate} />
          </div>
        ),
      },
      {
        id: 'templating',
        eyebrow: 'Slide 04',
        title: 'Template variables, rendering, and governance',
        summary:
          'Templates are stored as owned communication contracts. ORBI Core sends variables, ORBI Talk renders the final body, queues the message, and records the rendered output for audit.',
        icon: Code2,
        accent: 'from-sky-500 to-cyan-700',
        body: (
          <div className="space-y-5">
            <div className="grid gap-4 lg:grid-cols-3">
              <MiniCard
                icon={ClipboardList}
                title="Template identity"
                detail="Use stable names like transaction_success, otp_login, provider_delay, or kyc_approved. Keep names lowercase and version only when behavior changes."
              />
              <MiniCard
                icon={Code2}
                title="Variable syntax"
                detail="Use double braces, for example {{amount}}, {{reference}}, {{otp}}, {{customerName}}. ORBI Core supplies values in the data object."
              />
              <MiniCard
                icon={ShieldCheck}
                title="Safety rule"
                detail="Never put secrets, API keys, passwords, raw tokens, or internal fraud notes into a customer-facing template variable."
              />
            </div>

            <div className="grid gap-5 xl:grid-cols-2">
              <CodeBlock label="message_templates document" value={templateRecord} />
              <CodeBlock label="Variable render example" value={templateRenderExample} />
            </div>

            <div className="rounded-[24px] border border-amber-200 bg-amber-50 p-5">
              <h4 className="text-sm font-black text-amber-900">How ORBI Talk handles templates</h4>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {[
                  'Looks up template by name, channel, language, and owner scope.',
                  'Replaces {{variableName}} placeholders using the request data object.',
                  'Stores the rendered body in message_logs so delivery can be audited later.',
                  'Uses requestId to prevent duplicate jobs during backend retries.',
                  'Queues SMS jobs when no relay is online, then background workers retry later.',
                  'Keeps email/push template-driven so direct uncontrolled sends are avoided.',
                ].map((item) => (
                  <div key={item} className="flex gap-3 rounded-2xl bg-white/70 p-3">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <p className="text-[13px] font-bold leading-6 text-amber-950">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ),
      },
      {
        id: 'direct-sms',
        eyebrow: 'Slide 05',
        title: 'Direct SMS API',
        summary:
          'Use direct SMS only for controlled operational cases. Financial and customer lifecycle messages should prefer templates.',
        icon: TerminalSquare,
        accent: 'from-amber-500 to-orange-600',
        body: (
          <div className="grid gap-5 xl:grid-cols-2">
            <CodeBlock label="POST /api/send-sms payload" value={directPayload} />
            <CodeBlock
              label="Response shape"
              value={JSON.stringify(
                {
                  success: true,
                  messageId: 'message_logs_doc_id',
                  pushed: true,
                  dispatchReason: null,
                  ownerUid: 'relay-owner-firebase-uid',
                  message: 'Message pushed to device',
                },
                null,
                2,
              )}
            />
          </div>
        ),
      },
      {
        id: 'email',
        eyebrow: 'Slide 06',
        title: 'Email service and provider delivery',
        summary:
          'ORBI Talk can now send email through server-side provider secrets. Use template email for production flows and direct email for controlled operational messages.',
        icon: Mail,
        accent: 'from-fuchsia-500 to-indigo-700',
        body: (
          <div className="space-y-5">
            <div className="grid gap-4 lg:grid-cols-3">
              <MiniCard
                icon={Mail}
                title="Template email"
                detail="Call /api/send-template with channel='email'. ORBI Talk renders subject/body variables and sends through the configured email provider."
              />
              <MiniCard
                icon={KeyRound}
                title="Provider secrets"
                detail="Configure ORBI_TALK_EMAIL_PROVIDER plus Resend or SMTP secrets only on the server. Never expose them in frontend code."
              />
              <MiniCard
                icon={ShieldCheck}
                title="Status tracking"
                detail="Email jobs are stored in message_logs with provider, providerMessageId, status, sentAt, and delivery/audit metadata."
              />
            </div>
            <div className="grid gap-5 xl:grid-cols-2">
              <CodeBlock label="Template email payload" value={emailTemplatePayload} />
              <CodeBlock label="Direct /api/send-email payload" value={directEmailPayload} />
            </div>
            <CodeBlock
              label="Email provider env"
              value={[
                'ORBI_TALK_EMAIL_PROVIDER=resend',
                'ORBI_TALK_EMAIL_FROM="ORBI Financial <no-reply@orbifinancial.com>"',
                'ORBI_TALK_EMAIL_REPLY_TO=""',
                'ORBI_TALK_EMAIL_ALLOWED_FROM="ORBI Financial <no-reply@orbifinancial.com>,ORBI Support <support@orbifinancial.com>,ORBI Sales <sales@orbifinancial.com>,ORBI Security <security@orbifinancial.com>,ORBI Admin <admin@orbifinancial.com>,ORBI Info <info@orbifinancial.com>"',
                'ORBI_TALK_RESEND_API_KEY=re_xxxxxxxxxxxxxxxxx',
                '',
                '# Cloudflare Email Routing handles replies to each From alias.',
                '',
                '# SMTP alternative',
                'ORBI_TALK_EMAIL_PROVIDER=smtp',
                'ORBI_TALK_SMTP_HOST=smtp.example.com',
                'ORBI_TALK_SMTP_PORT=587',
                'ORBI_TALK_SMTP_SECURE=false',
                'ORBI_TALK_SMTP_USER=mailer@example.com',
                'ORBI_TALK_SMTP_PASS=server-secret-password',
              ].join('\n')}
            />
            <CodeBlock label="Template email cURL" value={curlEmailTemplate} />
          </div>
        ),
      },
      {
        id: 'pairing',
        eyebrow: 'Slide 07',
        title: 'Device pairing and live relay',
        summary:
          'Relay devices connect over WebSocket, identify themselves, maintain heartbeat, and receive SEND_SMS jobs in real time.',
        icon: Smartphone,
        accent: 'from-slate-700 to-cyan-700',
        body: (
          <div className="grid gap-5 xl:grid-cols-2">
            <CodeBlock label="Pairing metadata" value={pairingPayload} />
            <CodeBlock
              label="WebSocket job received by device"
              value={JSON.stringify(
                {
                  type: 'new_message',
                  message: {
                    id: 'message_logs_doc_id',
                    messageId: 'message_logs_doc_id',
                    task: 'SEND_SMS',
                    phone: '+255764258114',
                    recipient: '+255764258114',
                    body: 'Rendered SMS body',
                    channel: 'sms',
                  },
                },
                null,
                2,
              )}
            />
          </div>
        ),
      },
      {
        id: 'queue',
        eyebrow: 'Slide 08',
        title: 'Queue recovery and force resend',
        summary:
          'Unsent jobs stay in Firestore and are retried silently. Operators can also force a resend sweep when a relay is available.',
        icon: RefreshCw,
        accent: 'from-rose-500 to-amber-500',
        body: (
          <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-4">
              <MiniCard
                icon={RefreshCw}
                title="Automatic worker"
                detail="Scans pending, queued, and failed SMS jobs, applies cooldown protection, and pushes to online devices."
              />
              <MiniCard
                icon={Smartphone}
                title="Device-online flush"
                detail="When a relay reconnects, the gateway immediately attempts a small queue flush instead of waiting for the next interval."
              />
            </div>
            <CodeBlock label="POST /api/messages/force-resend-queue" value={curlForceQueue} />
          </div>
        ),
      },
      {
        id: 'status',
        eyebrow: 'Slide 09',
        title: 'Status callbacks and audit trail',
        summary:
          'The relay reports sent, failed, and delivered states. ORBI Talk updates message_logs and keeps operators inside Message Tracking.',
        icon: Webhook,
        accent: 'from-violet-500 to-blue-700',
        body: (
          <div className="grid gap-5 xl:grid-cols-2">
            <CodeBlock
              label="HTTP status update"
              value={JSON.stringify(
                {
                  messageId: 'message_logs_doc_id',
                  status: 'sent',
                  deviceId: 'orbi-talk-relay-01',
                },
                null,
                2,
              )}
            />
            <CodeBlock
              label="Delivery report"
              value={JSON.stringify(
                {
                  messageId: 'message_logs_doc_id',
                  status: 'delivered',
                  deviceId: 'orbi-talk-relay-01',
                  deliveredAt: 'serverTimestamp',
                },
                null,
                2,
              )}
            />
          </div>
        ),
      },
      {
        id: 'checklist',
        eyebrow: 'Slide 10',
        title: 'Production integration checklist',
        summary:
          'Use this as the go-live sequence when connecting ORBI Core, Render, Firebase, and Android relay devices.',
        icon: CheckCircle2,
        accent: 'from-teal-600 to-slate-900',
        body: (
          <div className="grid gap-4 md:grid-cols-2">
            {[
              'Set ORBI_TALK_GATEWAY_URL to https://talk.orbifinancial.com on ORBI Core.',
              'Create scoped API key in Settings and store it only in backend secrets.',
              'Create message templates before sending transaction or OTP events.',
              'Pair at least one Android relay device and confirm heartbeat is online.',
              'Send a template test and verify Message Tracking shows queued, sent, then delivered.',
              'Keep Force Queue for operations recovery, not normal application retry loops.',
            ].map((item) => (
              <div key={item} className="flex gap-3 rounded-[22px] border border-slate-200 bg-white/85 p-4">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                <p className="text-sm font-bold leading-6 text-slate-700">{item}</p>
              </div>
            ))}
          </div>
        ),
      },
    ],
    [],
  );

  const [activeIndex, setActiveIndex] = useState(0);
  const activeSlide = slides[activeIndex];
  const ActiveIcon = activeSlide.icon;

  const go = (delta: number) => {
    setActiveIndex((current) => (current + delta + slides.length) % slides.length);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-6 py-8 md:px-8">
      <section className="relative overflow-hidden rounded-[34px] border border-slate-200 bg-[linear-gradient(135deg,#f8fcff,#eaf4ff)] p-6 shadow-[0_22px_55px_rgba(15,23,42,0.08)] md:p-8">
        <div className="pointer-events-none absolute right-0 top-0 h-72 w-72 rounded-full bg-cyan-200/35 blur-3xl" />
        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p className="section-kicker">Developer Operations Manual</p>
            <h1 className="display-heading mt-3 text-[2rem] md:text-[2.75rem]">ORBI Talk Gateway API Slides</h1>
            <p className="mt-4 text-sm font-semibold leading-7 text-slate-600 md:text-base">
              A production guide for connecting ORBI Core, trusted backends, templates, relay devices, queue workers,
              and secrets without mixing browser concerns into server-side delivery.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="enterprise-pill border-cyan-200 bg-cyan-50 text-cyan-700">Base: {talkBaseUrl}</span>
            <span className="enterprise-pill border-emerald-200 bg-emerald-50 text-emerald-700">WSS: wss://talk.orbifinancial.com</span>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[310px_1fr]">
        <aside className="section-shell h-fit space-y-2">
          {slides.map((slide, index) => {
            const Icon = slide.icon;
            const isActive = index === activeIndex;
            return (
              <button
                key={slide.id}
                onClick={() => setActiveIndex(index)}
                className={`w-full rounded-[22px] border p-4 text-left transition-all ${
                  isActive
                    ? 'border-cyan-300 bg-white shadow-[0_12px_28px_rgba(8,145,178,0.12)]'
                    : 'border-transparent bg-transparent hover:border-slate-200 hover:bg-white/70'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${slide.accent} text-white`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{slide.eyebrow}</p>
                    <p className="mt-1 text-sm font-black leading-5 text-slate-900">{slide.title}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </aside>

        <main className="space-y-5">
          <section className="enterprise-card enterprise-card-strong overflow-hidden">
            <div className={`bg-gradient-to-br ${activeSlide.accent} p-6 text-white md:p-8`}>
              <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                <div className="max-w-3xl">
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-white/70">{activeSlide.eyebrow}</p>
                  <h2 className="mt-3 text-2xl font-black tracking-tight md:text-4xl">{activeSlide.title}</h2>
                  <p className="mt-4 text-sm font-semibold leading-7 text-white/82">{activeSlide.summary}</p>
                </div>
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[24px] border border-white/20 bg-white/15">
                  <ActiveIcon className="h-8 w-8" />
                </div>
              </div>
            </div>
            <div className="p-5 md:p-7">{activeSlide.body}</div>
          </section>

          <div className="flex flex-col gap-3 rounded-[26px] border border-slate-200 bg-white/90 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <button onClick={() => go(-1)} className="enterprise-button-secondary">
              <ArrowLeft className="h-4 w-4" /> Previous
            </button>
            <div className="flex justify-center gap-2">
              {slides.map((slide, index) => (
                <button
                  key={slide.id}
                  onClick={() => setActiveIndex(index)}
                  className={`h-2.5 rounded-full transition-all ${index === activeIndex ? 'w-10 bg-cyan-700' : 'w-2.5 bg-slate-300 hover:bg-slate-400'}`}
                  aria-label={`Open ${slide.title}`}
                />
              ))}
            </div>
            <button onClick={() => go(1)} className="enterprise-button-primary">
              Next <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          <section className="section-shell grid gap-4 lg:grid-cols-3">
            <MiniCard
              icon={Code2}
              title="Server-side only"
              detail="ORBI Talk API keys belong in backend env/secrets. Browser users authenticate through Firebase, not API keys."
            />
            <MiniCard
              icon={RefreshCw}
              title="Safe retries"
              detail="Use requestId for idempotency and let queue workers recover unsent jobs instead of creating duplicate sends."
            />
            <MiniCard
              icon={ShieldCheck}
              title="Audit every job"
              detail="Message logs record owner, template, recipient, status, device, retry counts, and delivery reports."
            />
          </section>
        </main>
      </div>
    </div>
  );
}
