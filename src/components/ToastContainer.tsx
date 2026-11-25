import React from 'react';
import { CheckCircle2, Info, AlertTriangle, X } from 'lucide-react';
import { usePos } from '../context/PosContext';

export const ToastContainer: React.FC = () => {
  const { toasts, dismissToast } = usePos();

  if (toasts.length === 0) return null;

  return (
    <div className="no-print fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-[calc(100vw-2.5rem)]">
      {toasts.map((toast) => {
        const icon =
          toast.tone === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-[#1B4D3E] shrink-0" />
          ) : toast.tone === 'warning' || toast.tone === 'error' ? (
            <AlertTriangle className="w-4 h-4 text-[#9A520A] shrink-0" />
          ) : (
            <Info className="w-4 h-4 text-[#1B4D3E] shrink-0" />
          );

        return (
          <div
            key={toast.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-[#E8E6DF] bg-white px-4 py-3 shadow-lg text-sm font-medium text-[#252525]"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {icon}
              <span className="leading-snug">{toast.text}</span>
            </div>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              className="p-1 text-[#64625C] hover:text-[#252525] rounded-md shrink-0"
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
