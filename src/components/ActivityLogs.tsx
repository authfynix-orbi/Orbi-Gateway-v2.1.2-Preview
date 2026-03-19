import React, { useEffect, useState } from 'react';
import { collection, doc, getDoc, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock3,
  Info,
  MessageSquare,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { auth, db } from '../firebase';
import { handleFirestoreError, OperationType } from '../firestoreUtils';

interface ActivityLog {
  id: string;
  type: string;
  details: string;
  deviceId?: string;
  ownerUid?: string;
  timestamp: any;
}

export default function ActivityLogs() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db || !auth.currentUser) {
      return;
    }

    const setupListener = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', auth.currentUser!.uid));
        const isAdmin =
          (userDoc.exists() && userDoc.data().role === 'admin') ||
          (auth.currentUser?.email === 'auth.fynix@gmail.com' && auth.currentUser?.emailVerified === true);

        const activityQuery = isAdmin
          ? query(collection(db, 'activity_logs'), orderBy('timestamp', 'desc'), limit(80))
          : query(
              collection(db, 'activity_logs'),
              where('ownerUid', '==', auth.currentUser!.uid),
              orderBy('timestamp', 'desc'),
              limit(80),
            );

        return onSnapshot(
          activityQuery,
          (snapshot) => {
            const logList = snapshot.docs.map((activityDoc) => ({
              id: activityDoc.id,
              ...activityDoc.data(),
            })) as ActivityLog[];
            setLogs(logList);
            setLoading(false);
          },
          (error) => {
            handleFirestoreError(error, OperationType.GET, 'activity_logs');
            setLoading(false);
          },
        );
      } catch (error) {
        console.error('Error setting up activity logs listener:', error);
        setLoading(false);
        return undefined;
      }
    };

    let unsubscribe: (() => void) | undefined;
    setupListener().then((listener) => {
      unsubscribe = listener;
    });

    return () => {
      unsubscribe?.();
    };
  }, []);

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-6 py-8 md:px-8">
      <section className="enterprise-card enterprise-card-strong overflow-hidden">
        <div className="border-b border-slate-200 bg-[linear-gradient(135deg,rgba(255,255,255,0.95),rgba(236,242,255,0.9))] px-7 py-7 md:px-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.22em] text-indigo-700">
                <Activity className="h-3.5 w-3.5" />
                Activity Center
              </div>
              <div>
                <h1 className="text-3xl font-black tracking-[-0.03em] text-slate-950 md:text-4xl">
                  Event-level operational history
                </h1>
                <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-slate-600 md:text-base">
                  The activity stream is intentionally separated from the dashboard so operators can inspect
                  device registration, delivery transitions, and dispatch anomalies without KPI noise.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <SummaryCard
                title="Visible Events"
                value={loading ? '...' : logs.length.toLocaleString()}
                tone="indigo"
              />
              <SummaryCard
                title="Tracked Devices"
                value={loading ? '...' : countDistinctDevices(logs).toLocaleString()}
                tone="emerald"
              />
              <SummaryCard
                title="Latest Window"
                value="80"
                tone="amber"
              />
            </div>
          </div>
        </div>

        <div className="grid gap-0 xl:grid-cols-[280px_1fr]">
          <aside className="border-b border-slate-200 bg-slate-50/90 p-6 xl:border-b-0 xl:border-r">
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">Interpretation Guide</p>
            <div className="mt-5 space-y-3">
              <LegendRow icon={<Smartphone className="h-4 w-4 text-indigo-600" />} label="Device registration and identity updates" />
              <LegendRow icon={<MessageSquare className="h-4 w-4 text-emerald-600" />} label="Status transitions from the Android gateway" />
              <LegendRow icon={<Activity className="h-4 w-4 text-amber-600" />} label="Messages pushed to live devices" />
              <LegendRow icon={<CheckCircle2 className="h-4 w-4 text-cyan-600" />} label="Successful delivery confirmations" />
              <LegendRow icon={<AlertCircle className="h-4 w-4 text-rose-600" />} label="Failures or recoverable anomalies" />
            </div>

            <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-5">
              <div className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">
                <ShieldCheck className="h-4 w-4 text-slate-700" />
                Review posture
              </div>
              <p className="mt-3 text-sm font-medium leading-6 text-slate-600">
                Use this page for operational forensics. If queue counts rise on the dashboard, the event
                sequence here should explain whether the issue is assignment, dispatch, device state, or delivery.
              </p>
            </div>
          </aside>

          <section className="min-h-[640px]">
            {loading ? (
              <div className="flex h-full min-h-[640px] items-center justify-center">
                <div className="h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-600" />
              </div>
            ) : logs.length === 0 ? (
              <div className="flex h-full min-h-[640px] items-center justify-center px-6">
                <div className="max-w-md text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl border border-slate-200 bg-slate-50">
                    <Info className="h-7 w-7 text-slate-400" />
                  </div>
                  <h2 className="mt-6 text-2xl font-black tracking-tight text-slate-950">No activity logs found</h2>
                  <p className="mt-3 text-sm font-medium leading-6 text-slate-600">
                    Once devices connect and messages begin flowing, this stream will populate with the latest
                    operational events.
                  </p>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {logs.map((log, index) => (
                  <article
                    key={log.id}
                    className="grid gap-4 px-6 py-5 transition-colors hover:bg-slate-50/70 md:grid-cols-[52px_1fr_auto] md:px-8"
                  >
                    <div className="relative flex items-start justify-center">
                      <div className="relative z-10 flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
                        {getLogIcon(log.type)}
                      </div>
                      {index !== logs.length - 1 && (
                        <div className="absolute top-11 h-full w-px bg-slate-200" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`tone-chip ${getTypeTone(log.type)}`}>{formatType(log.type)}</span>
                        {log.deviceId && (
                          <span className="enterprise-pill enterprise-pill-neutral">
                            <Smartphone className="h-3.5 w-3.5" />
                            {log.deviceId.slice(0, 10)}
                          </span>
                        )}
                      </div>
                      <p className="mt-3 text-sm font-bold leading-6 text-slate-900 md:text-[15px]">
                        {log.details}
                      </p>
                    </div>

                    <div className="flex items-start md:justify-end">
                      <div className="enterprise-pill enterprise-pill-neutral">
                        <Clock3 className="h-3.5 w-3.5" />
                        {formatTimestamp(log.timestamp)}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  tone,
}: {
  title: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white/85 p-4">
      <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">{title}</p>
      <div className={`mt-3 inline-flex rounded-2xl px-3 py-2 ${summaryToneClass(tone)}`}>
        <span className="text-lg font-black tracking-tight">{value}</span>
      </div>
    </div>
  );
}

function LegendRow({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <div className="mt-0.5">{icon}</div>
      <p className="text-sm font-medium leading-6 text-slate-600">{label}</p>
    </div>
  );
}

function getLogIcon(type: string) {
  switch (type) {
    case 'device_info':
      return <Smartphone className="h-4 w-4 text-indigo-600" />;
    case 'message_status':
      return <MessageSquare className="h-4 w-4 text-emerald-600" />;
    case 'delivery_report':
      return <CheckCircle2 className="h-4 w-4 text-cyan-600" />;
    case 'message_pushed':
      return <Activity className="h-4 w-4 text-amber-600" />;
    default:
      return <Info className="h-4 w-4 text-slate-500" />;
  }
}

function getTypeTone(type: string) {
  switch (type) {
    case 'device_info':
      return 'tone-chip-indigo';
    case 'message_status':
      return 'tone-chip-emerald';
    case 'delivery_report':
      return 'tone-chip-cyan';
    case 'message_pushed':
      return 'tone-chip-amber';
    default:
      return 'tone-chip-slate';
  }
}

function formatType(type: string) {
  return type.replace(/_/g, ' ');
}

function formatTimestamp(timestamp: any) {
  const date = timestamp?.toDate?.() || (timestamp ? new Date(timestamp) : null);
  if (!date || Number.isNaN(date.getTime())) {
    return 'Just now';
  }
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

function countDistinctDevices(logs: ActivityLog[]) {
  return new Set(logs.map((entry) => entry.deviceId).filter(Boolean)).size;
}

function summaryToneClass(tone: string) {
  switch (tone) {
    case 'indigo':
      return 'bg-indigo-50 text-indigo-700';
    case 'emerald':
      return 'bg-emerald-50 text-emerald-700';
    case 'amber':
      return 'bg-amber-50 text-amber-700';
    default:
      return 'bg-slate-100 text-slate-700';
  }
}
