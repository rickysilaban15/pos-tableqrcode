import React from 'react';
import { CheckCircle2, Info, AlertTriangle, X } from 'lucide-react';
import { useToast } from '../context/ToastContext';

export const ToastContainer: React.FC = () => {
  const { toasts, dismissToast } = useToast();

  if (toasts.length === 0) return null;

  const visible = toasts.slice(-2);

  return (
    <div
      role="region"
      aria-live="polite"
      aria-label="Notifikasi aplikasi"
      className="no-print pointer-events-none fixed top-16 right-4 sm:top-auto sm:bottom-5 sm:right-5 z-50 flex flex-col gap-2 max-w-sm w-[calc(100vw-2rem)]"
    >
      {visible.map((toast) => {
        const icon =
          toast.tone === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-[#15623A] shrink-0" />
          ) : toast.tone === 'warning' || toast.tone === 'error' ? (
            <AlertTriangle className="w-4 h-4 text-[#9A520A] shrink-0" />
          ) : (
            <Info className="w-4 h-4 text-[#1B4D3E] shrink-0" />
          );

        return (
          <div
            key={toast.id}
            className="pointer-events-auto flex items-center justify-between gap-3 rounded-xl border border-[#E8E6DF] bg-white/98 px-3.5 py-2.5 shadow-[0_10px_28px_rgba(37,37,37,0.12)] backdrop-blur-sm text-xs sm:text-sm font-medium text-[#252525]"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {icon}
              <span className="leading-snug truncate sm:whitespace-normal">{toast.text}</span>
            </div>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              className="p-1 text-[#5C5952] hover:text-[#252525] rounded-md shrink-0"
              aria-label="Tutup notifikasi"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
