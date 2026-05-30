import React, { useEffect, useState } from 'react';
import { Timestamp, collection, doc, getDoc, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { User } from 'firebase/auth';
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Clock3,
  MessageSquare,
  ShieldCheck,
  Smartphone,
  TrendingUp,
  Zap,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { db } from '../firebase';
import { handleFirestoreError, OperationType } from '../firestoreUtils';

type DashboardStats = {
  totalMessages: number;
  successRate: number;
  activeDevices: number;
  pendingMessages: number;
  failedMessages: number;
  deliveredMessages: number;
};

type ChannelStat = {
  name: string;
  value: number;
  tone: string;
};

type ChartPoint = {
  name: string;
  sent: number;
  failed: number;
};

type LiveDeviceStatus = {
  deviceId: string;
  status: 'online' | 'offline' | 'busy';
  heartbeatAlive: boolean;
};

const initialChartData: ChartPoint[] = [
  { name: 'Mon', sent: 0, failed: 0 },
  { name: 'Tue', sent: 0, failed: 0 },
  { name: 'Wed', sent: 0, failed: 0 },
  { name: 'Thu', sent: 0, failed: 0 },
  { name: 'Fri', sent: 0, failed: 0 },
  { name: 'Sat', sent: 0, failed: 0 },
  { name: 'Sun', sent: 0, failed: 0 },
];

const initialChannelStats: ChannelStat[] = [
  { name: 'SMS', value: 0, tone: 'indigo' },
  { name: 'WhatsApp', value: 0, tone: 'emerald' },
  { name: 'Email', value: 0, tone: 'amber' },
  { name: 'Push', value: 0, tone: 'rose' },
];

const DASHBOARD_WINDOW_DAYS = 30;
const DASHBOARD_MESSAGE_LIMIT = 1500;

export default function Dashboard({ user }: { user: User | null }) {
  const [stats, setStats] = useState<DashboardStats>({
    totalMessages: 0,
    successRate: 0,
    activeDevices: 0,
    pendingMessages: 0,
    failedMessages: 0,
    deliveredMessages: 0,
  });
  const [channelStats, setChannelStats] = useState<ChannelStat[]>(initialChannelStats);
  const [chartData, setChartData] = useState<ChartPoint[]>(initialChartData);
  const [dashboardDeviceIds, setDashboardDeviceIds] = useState<string[]>([]);

  useEffect(() => {
    if (!db || !user) {
      return;
    }

    let unsubscribeMessages: (() => void) | undefined;
    let unsubscribeDevices: (() => void) | undefined;

    const setupListeners = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        const isAdmin =
          (userDoc.exists() && userDoc.data().role === 'admin') ||
          (user.email === 'auth.fynix@gmail.com' && user.emailVerified === true);
        const cutoffTimestamp = Timestamp.fromDate(
          new Date(Date.now() - DASHBOARD_WINDOW_DAYS * 24 * 60 * 60 * 1000),
        );

        const messagesQuery = isAdmin
          ? query(
              collection(db, 'message_logs'),
              where('timestamp', '>=', cutoffTimestamp),
              orderBy('timestamp', 'desc'),
              limit(DASHBOARD_MESSAGE_LIMIT),
            )
          : query(
              collection(db, 'message_logs'),
              where('createdBy', '==', user.uid),
              where('timestamp', '>=', cutoffTimestamp),
              orderBy('timestamp', 'desc'),
              limit(DASHBOARD_MESSAGE_LIMIT),
            );

        unsubscribeMessages = onSnapshot(
          messagesQuery,
          (snapshot) => {
            const docs = snapshot.docs.map((messageDoc) => messageDoc.data());
            const totalMessages = docs.length;
            const deliveredMessages = docs.filter(
              (entry) => entry.status === 'sent' || entry.status === 'delivered',
            ).length;
            const failedMessages = docs.filter((entry) => entry.status === 'failed').length;
            const pendingMessages = docs.filter(
              (entry) =>
                entry.status === 'pending' ||
                entry.status === 'queued' ||
                entry.status === 'processing',
            ).length;
            const denominator = deliveredMessages + failedMessages;
            const successRate =
              denominator > 0 ? Number(((deliveredMessages / denominator) * 100).toFixed(1)) : 0;

            setStats((prev) => ({
              ...prev,
              totalMessages,
              successRate,
              pendingMessages,
              failedMessages,
              deliveredMessages,
            }));

            setChannelStats([
              { name: 'SMS', value: docs.filter((entry) => entry.channel === 'sms').length, tone: 'indigo' },
              {
                name: 'WhatsApp',
                value: docs.filter((entry) => entry.channel === 'whatsapp').length,
                tone: 'emerald',
              },
              { name: 'Email', value: docs.filter((entry) => entry.channel === 'email').length, tone: 'amber' },
              { name: 'Push', value: docs.filter((entry) => entry.channel === 'push').length, tone: 'rose' },
            ]);

            const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const nextChartData = initialChartData.map((entry) => ({ ...entry }));

            docs.forEach((entry) => {
              if (!entry.timestamp) {
                return;
              }
              const date = entry.timestamp.toDate ? entry.timestamp.toDate() : new Date(entry.timestamp);
              const dayName = days[date.getDay()];
              const dayRow = nextChartData.find((item) => item.name === dayName);
              if (!dayRow) {
                return;
              }
              if (entry.status === 'sent' || entry.status === 'delivered') {
                dayRow.sent += 1;
              }
              if (entry.status === 'failed') {
                dayRow.failed += 1;
              }
            });

            setChartData(nextChartData);
          },
          (error) => handleFirestoreError(error, OperationType.GET, 'messages'),
        );

        const devicesQuery = isAdmin
          ? collection(db, 'devices')
          : query(collection(db, 'devices'), where('ownerUid', '==', user.uid));

        unsubscribeDevices = onSnapshot(
          devicesQuery,
          (snapshot) => {
            const deviceIds = snapshot.docs.map((deviceDoc) => deviceDoc.id).filter(Boolean);
            setDashboardDeviceIds(deviceIds);
          },
          (error) => handleFirestoreError(error, OperationType.GET, 'devices'),
        );
      } catch (error) {
        console.error('Error setting up dashboard listeners:', error);
      }
    };

    setupListeners();

    return () => {
      unsubscribeMessages?.();
      unsubscribeDevices?.();
    };
  }, [user]);

  useEffect(() => {
    if (!user || dashboardDeviceIds.length === 0) {
      setStats((prev) => ({ ...prev, activeDevices: 0 }));
      return;
    }

    let cancelled = false;

    const fetchLiveGatewayCount = async () => {
      try {
        const token = await user.getIdToken();
        if (!token || cancelled) return;

        const params = new URLSearchParams({
          deviceIds: dashboardDeviceIds.join(','),
        });
        const response = await fetch(`/api/devices/live-status?${params.toString()}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const payload = await response.json();
        if (cancelled) return;

        const devices = Array.isArray(payload.devices) ? (payload.devices as LiveDeviceStatus[]) : [];
        const activeDevices = devices.filter((device) => device.heartbeatAlive && device.status === 'online').length;
        setStats((prev) => ({ ...prev, activeDevices }));
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load dashboard live gateway count:', error);
        }
      }
    };

    fetchLiveGatewayCount();
    const interval = setInterval(fetchLiveGatewayCount, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [user, dashboardDeviceIds]);

  const throughputLabel =
    stats.totalMessages === 0 ? 'No throughput yet' : `${stats.deliveredMessages} delivered across current dataset`;
  const queueHealth =
    stats.pendingMessages === 0 ? 'Queue is clear' : `${stats.pendingMessages} message${stats.pendingMessages === 1 ? '' : 's'} awaiting completion`;

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-6 py-8 md:px-8">
      <section className="ops-hero-grid">
        <div className="ops-hero-panel">
          <div className="flex flex-wrap items-center gap-3">
            <span className="enterprise-pill enterprise-pill-success">
              <ShieldCheck className="h-3.5 w-3.5" />
              Operations Normal
            </span>
            <span className="enterprise-pill enterprise-pill-neutral">
              <Zap className="h-3.5 w-3.5" />
              Live Telemetry
            </span>
          </div>
          <div className="space-y-3">
            <p className="section-kicker">
              Executive Overview
            </p>
            <h1 className="display-heading max-w-3xl text-[1.9rem] md:text-[2.45rem]">
              Command visibility for ORBI Talk delivery, queue pressure, and relay readiness.
            </h1>
            <p className="section-subcopy max-w-2xl">
              ORBI Talk Gateway receives trusted template requests from ORBI Core, assigns work to paired Android
              relays, and tracks delivery outcomes without exposing customer messaging secrets to operators.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <HeroMetric
              label="Delivery confidence"
              value={`${stats.successRate}%`}
              detail={throughputLabel}
              icon={<TrendingUp className="h-4 w-4" />}
            />
            <HeroMetric
              label="Queue pressure"
              value={stats.pendingMessages.toLocaleString()}
              detail={queueHealth}
              icon={<Clock3 className="h-4 w-4" />}
            />
            <HeroMetric
              label="Live relays"
              value={stats.activeDevices.toLocaleString()}
              detail="Paired Android devices available for assignment"
              icon={<Smartphone className="h-4 w-4" />}
            />
          </div>
        </div>

        <div className="ops-status-panel">
          <div className="space-y-1">
            <p className="section-kicker">
              Operations Posture
            </p>
            <h2 className="display-heading text-[1.25rem] md:text-[1.5rem]">Service posture</h2>
          </div>
          <div className="space-y-4">
            <SignalRow
              label="Queue service"
              value={stats.pendingMessages === 0 ? 'Stable' : 'Under load'}
              tone={stats.pendingMessages === 0 ? 'emerald' : 'amber'}
            />
            <SignalRow
              label="Delivery stream"
              value={stats.failedMessages === 0 ? 'Healthy' : 'Degraded'}
              tone={stats.failedMessages === 0 ? 'emerald' : 'rose'}
            />
            <SignalRow
              label="Device fleet"
              value={stats.activeDevices > 0 ? 'Online' : 'No active devices'}
              tone={stats.activeDevices > 0 ? 'indigo' : 'slate'}
            />
          </div>
          <div className="rounded-3xl border border-slate-200 bg-slate-50/90 p-5">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-slate-400">Operator note</p>
            <p className="mt-3 text-sm font-medium leading-6 text-slate-600">
              This board tracks the latest {DASHBOARD_WINDOW_DAYS} days of traffic and keeps the live dataset
              intentionally bounded for enterprise-scale responsiveness.
            </p>
            <div className="mt-4 inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-slate-700">
              Recent operations window
              <ArrowRight className="h-3.5 w-3.5" />
            </div>
          </div>
        </div>
      </section>

      <section className="stat-grid">
        <StatCard
          title="Message Volume"
          value={stats.totalMessages.toLocaleString()}
          note="Total records processed"
          tone="indigo"
          icon={<MessageSquare className="h-5 w-5" />}
        />
        <StatCard
          title="Delivered"
          value={stats.deliveredMessages.toLocaleString()}
          note="Successful sends and deliveries"
          tone="emerald"
          icon={<CheckCircle2 className="h-5 w-5" />}
        />
        <StatCard
          title="Queue"
          value={stats.pendingMessages.toLocaleString()}
          note="Pending, queued, and processing"
          tone="amber"
          icon={<Clock3 className="h-5 w-5" />}
        />
        <StatCard
          title="Exceptions"
          value={stats.failedMessages.toLocaleString()}
          note="Messages requiring follow-up"
          tone="rose"
          icon={<Activity className="h-5 w-5" />}
        />
      </section>

      <section className="grid gap-8 xl:grid-cols-[1.7fr_1fr]">
        <div className="panel-shell min-w-0">
          <div className="panel-head">
            <div>
              <p className="panel-kicker">
                Throughput Trend
              </p>
              <h3 className="panel-title">
                Delivery performance over the last seven days
              </h3>
            </div>
            <div className="inline-flex items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
              <span className="inline-flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-indigo-500" />
                Sent
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-rose-400" />
                Failed
              </span>
            </div>
          </div>
          <div className="h-[340px] min-h-[340px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 6, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="opsSentGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1d4ed8" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#1d4ed8" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="opsFailedGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#e11d48" stopOpacity={0.16} />
                    <stop offset="100%" stopColor="#e11d48" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#dbe4f0" />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fontWeight: 800, fill: '#64748b' }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fontWeight: 800, fill: '#64748b' }}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: '20px',
                    border: '1px solid #dbe4f0',
                    boxShadow: '0 24px 48px rgba(15, 23, 42, 0.12)',
                    backgroundColor: '#ffffff',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="failed"
                  stroke="#e11d48"
                  strokeWidth={2}
                  fill="url(#opsFailedGradient)"
                />
                <Area
                  type="monotone"
                  dataKey="sent"
                  stroke="#1d4ed8"
                  strokeWidth={3}
                  fill="url(#opsSentGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="space-y-6">
          <div className="panel-shell">
            <p className="panel-kicker">
              Channel Mix
            </p>
            <h3 className="panel-title">
              Traffic distribution
            </h3>
            <div className="mt-6 space-y-4">
              {channelStats.map((channel) => {
                const percentage =
                  stats.totalMessages > 0 ? Math.round((channel.value / stats.totalMessages) * 100) : 0;
                return (
                  <div key={channel.name} className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-black text-slate-900">{channel.name}</p>
                        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
                          {percentage}% of traffic
                        </p>
                      </div>
                      <div className={`tone-chip tone-chip-${channel.tone}`}>{channel.value}</div>
                    </div>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full tone-bar tone-bar-${channel.tone}`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="panel-shell">
            <p className="panel-kicker">
              Governance
            </p>
            <h3 className="panel-title">
              Operator guidance
            </h3>
            <div className="mt-6 space-y-4">
              <GovernanceItem
                title="Investigate failures first"
                detail="Exception volume is visible here, and the recent-window tracker gives operators fast access to the latest actionable records."
              />
              <GovernanceItem
                title="Watch queue pressure"
                detail="Pending or processing growth is the earliest signal of dispatch or device assignment issues."
              />
              <GovernanceItem
                title="Validate live relay fleet"
                detail="A healthy delivery plane requires at least one online Android relay for each owner scope."
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function HeroMetric({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-white/60 bg-white/78 p-5 backdrop-blur-sm">
      <div className="flex items-center justify-between text-slate-500">
        <p className="text-[11px] font-black uppercase tracking-[0.24em]">{label}</p>
        <div className="rounded-2xl border border-slate-200 bg-white p-2">{icon}</div>
      </div>
      <p className="mt-4 text-3xl font-black tracking-tight text-slate-950">{value}</p>
      <p className="mt-2 text-sm font-medium leading-6 text-slate-600">{detail}</p>
    </div>
  );
}

function StatCard({
  title,
  value,
  note,
  tone,
  icon,
}: {
  title: string;
  value: string;
  note: string;
  tone: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="enterprise-card enterprise-card-strong p-6">
      <div className="flex items-center justify-between">
        <div className={`tone-chip tone-chip-${tone}`}>{icon}</div>
        <span className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">{title}</span>
      </div>
      <p className="mt-6 text-3xl font-black tracking-tight text-slate-950">{value}</p>
      <p className="mt-2 text-sm font-medium leading-6 text-slate-600">{note}</p>
    </div>
  );
}

function SignalRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white/70 px-4 py-3">
      <span className="text-sm font-bold text-slate-700">{label}</span>
      <span className={`tone-chip tone-chip-${tone}`}>{value}</span>
    </div>
  );
}

function GovernanceItem({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
      <p className="text-sm font-black text-slate-900">{title}</p>
      <p className="mt-2 text-sm font-medium leading-6 text-slate-600">{detail}</p>
    </div>
  );
}
