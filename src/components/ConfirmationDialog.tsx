import React from 'react';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';

type ConfirmationDialogProps = {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  tone?: 'danger' | 'primary';
  isProcessing?: boolean;
  effects?: string[];
};

export default function ConfirmationDialog({
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  tone = 'primary',
  isProcessing = false,
  effects = [],
}: ConfirmationDialogProps) {
  if (!isOpen) return null;

  const toneStyles = tone === 'danger'
    ? {
        shell: 'bg-rose-50 text-rose-700 border-rose-100',
        button: 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-100',
        badge: 'border-rose-200 bg-rose-50 text-rose-700',
        icon: <AlertTriangle className="w-6 h-6" />,
      }
    : {
        shell: 'bg-indigo-50 text-indigo-700 border-indigo-100',
        button: 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-100',
        badge: 'border-indigo-200 bg-indigo-50 text-indigo-700',
        icon: <CheckCircle2 className="w-6 h-6" />,
      };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-950/30 backdrop-blur-[3px]"
        onClick={isProcessing ? undefined : onCancel}
      />
      <div className="enterprise-card enterprise-card-strong page-fade-in relative z-10 w-full max-w-lg overflow-hidden p-7">
        <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#0f766e,#2563eb,#f59e0b)]" />
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className={`flex h-14 w-14 items-center justify-center rounded-2xl border ${toneStyles.shell}`}>
              {toneStyles.icon}
            </div>
            <div className="space-y-2">
              <div className={`enterprise-pill ${toneStyles.badge}`}>
                Action Review
              </div>
              <div>
                <h3 className="text-xl font-black tracking-tight text-slate-950">{title}</h3>
                <p className="mt-2 text-sm font-medium leading-6 text-slate-600">{message}</p>
              </div>
            </div>
          </div>
          <button
            onClick={onCancel}
            disabled={isProcessing}
            className="rounded-2xl border border-slate-200 bg-white p-2 text-slate-400 transition-all hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Close confirmation dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {effects.length > 0 && (
          <div className="mt-6 rounded-[24px] border border-slate-200 bg-slate-50/90 p-5">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Action Effects</p>
            <div className="mt-3 space-y-2">
              {effects.map((effect) => (
                <div key={effect} className="flex items-start gap-3 text-sm font-medium text-slate-700">
                  <span className="mt-1 h-2 w-2 rounded-full bg-cyan-500" />
                  <span>{effect}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            onClick={onCancel}
            disabled={isProcessing}
            className="enterprise-button-secondary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={isProcessing}
            className={`enterprise-button min-w-36 shadow-lg disabled:cursor-not-allowed disabled:opacity-60 ${toneStyles.button}`}
          >
            {isProcessing ? 'Working...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
