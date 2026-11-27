import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { formatRupiah } from '../utils/format';
import { QrCodeCanvas } from './QrCodeCanvas';

export interface DynamicQrisCardProps {
  merchantName: string;
  amount: number;
  providerOrderId?: string | null;
  qrString?: string | null;
  qrImageUrl?: string | null;
  expiresAt?: string | null;
  environment?: 'SANDBOX' | 'PRODUCTION' | string;
  status: 'PENDING' | 'PAID' | 'EXPIRED' | 'FAILED';
  reconciling?: boolean;
  reconcileMessage?: string;
  onReconcile?: () => void;
  onRecoveryAction?: () => void;
  recoveryLabel?: string;
  compact?: boolean;
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return '00:00';
  const totalSec = Math.ceil(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const DynamicQrisCard: React.FC<DynamicQrisCardProps> = ({
  merchantName,
  amount,
  providerOrderId,
  qrString,
  qrImageUrl,
  expiresAt,
  environment = 'SANDBOX',
  status,
  reconciling = false,
  reconcileMessage,
  onReconcile,
  onRecoveryAction,
  recoveryLabel = 'Buat Pesanan Baru',
  compact = false,
}) => {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [copiedSimRef, setCopiedSimRef] = useState(false);

  useEffect(() => {
    if (status !== 'PENDING' || !expiresAt) return;
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [status, expiresAt]);

  const expiryMs = expiresAt ? new Date(expiresAt).getTime() : null;
  const remainingMs = expiryMs !== null && !Number.isNaN(expiryMs) ? expiryMs - nowMs : null;
  const isTimeUp = status === 'EXPIRED' || (status === 'PENDING' && remainingMs !== null && remainingMs <= 0);
  const effectiveStatus = isTimeUp && status === 'PENDING' ? 'EXPIRED' : status;
  const isSandbox = String(environment).toUpperCase() === 'SANDBOX';

  const simulatorValueToCopy = qrImageUrl || qrString || '';

  const handleCopySimulatorRef = async () => {
    if (!simulatorValueToCopy) return;
    try {
      await navigator.clipboard.writeText(simulatorValueToCopy);
      setCopiedSimRef(true);
      window.setTimeout(() => setCopiedSimRef(false), 2000);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  return (
    <div className="rounded-2xl border border-[#E8E6DF] bg-white overflow-hidden">
      {/* Sandbox Warning Banner */}
      {isSandbox && (
        <div
          role="note"
          className="flex items-start gap-2.5 border-b border-[#F6D3AE] bg-[#FEF3E6] px-4 py-2.5 text-xs text-[#7C4106]"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#9A520A]" />
          <div className="leading-relaxed">
            <span className="inline-block rounded bg-[#9A520A] px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-white mr-1.5">
              SANDBOX
            </span>
            <strong>Simulasi Tanpa Uang Asli:</strong> jangan pindai dengan aplikasi bank atau e-wallet asli. Selesaikan pembayaran melalui Simulator Resmi Midtrans.
          </div>
        </div>
      )}

      <div className={compact ? 'p-4 space-y-4' : 'p-5 space-y-4'}>
        {/* Header: Merchant + Gross Amount + Countdown */}
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#E8E6DF] pb-3.5">
          <div>
            <p className="text-xs font-semibold text-[#5C5952]">QRIS Otomatis · {merchantName}</p>
            <p className="mt-0.5 font-mono text-2xl font-extrabold text-[#1B4D3E] tabular-nums">
              {formatRupiah(amount)}
            </p>
            {providerOrderId && (
              <p className="mt-0.5 font-mono text-[11px] text-[#5C5952]">Ref: {providerOrderId}</p>
            )}
          </div>

          {effectiveStatus === 'PENDING' && remainingMs !== null && (
            <div
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold tabular-nums ${
                remainingMs <= 120_000
                  ? 'border-[#F6C5C5] bg-[#FDECEC] text-[#A62626]'
                  : 'border-[#E8E6DF] bg-[#FAF9F6] text-[#252525]'
              }`}
              aria-live="off"
            >
              <Clock className="h-3.5 w-3.5 text-[#1B4D3E]" />
              <span className="font-mono">{formatRemaining(remainingMs)}</span>
            </div>
          )}

          {effectiveStatus === 'PAID' && (
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-[#B8E1C8] bg-[#E9F5EE] px-3 py-1.5 text-xs font-bold text-[#15623A]">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Lunas Terverifikasi
            </span>
          )}

          {effectiveStatus === 'EXPIRED' && (
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-[#F6D3AE] bg-[#FEF3E6] px-3 py-1.5 text-xs font-bold text-[#9A520A]">
              <Clock className="h-3.5 w-3.5" />
              Kedaluwarsa
            </span>
          )}

          {effectiveStatus === 'FAILED' && (
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-[#F6C5C5] bg-[#FDECEC] px-3 py-1.5 text-xs font-bold text-[#A62626]">
              <XCircle className="h-3.5 w-3.5" />
              Gagal / Dibatalkan
            </span>
          )}
        </div>

        {/* Body by State */}
        {effectiveStatus === 'PAID' ? (
          <div className="rounded-xl border border-[#B8E1C8] bg-[#E9F5EE] p-4 text-center space-y-1.5">
            <CheckCircle2 className="mx-auto h-9 w-9 text-[#15623A]" />
            <h3 className="text-sm font-extrabold text-[#15623A]">Pembayaran QRIS Otomatis Terverifikasi!</h3>
            <p className="text-xs text-[#1B4D3E] leading-relaxed">
              Dana telah dikonfirmasi oleh penyedia pembayaran dan pesanan otomatis masuk ke antrean barista.
            </p>
          </div>
        ) : effectiveStatus === 'EXPIRED' || effectiveStatus === 'FAILED' ? (
          <div className="rounded-xl border border-[#F6C5C5] bg-[#FDECEC] p-4 text-center space-y-2.5">
            <XCircle className="mx-auto h-8 w-8 text-[#A62626]" />
            <h3 className="text-sm font-extrabold text-[#252525]">
              {effectiveStatus === 'EXPIRED'
                ? 'Batas Waktu Pembayaran QRIS Berakhir'
                : 'Tagihan QRIS Tidak Dapat Diproses'}
            </h3>
            <p className="text-xs text-[#5C5952] leading-relaxed">
              {effectiveStatus === 'EXPIRED'
                ? 'Kode QRIS dinamis ini sudah tidak berlaku. Jika Anda sempat menyelesaikan pembayaran tepat sebelum batas waktu, klik Cek Status Pembayaran untuk rekonsiliasi.'
                : 'Pembayaran ditolak atau dibatalkan oleh penyedia. Silakan buat pesanan baru atau gunakan metode lain.'}
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-2 pt-1">
              {onReconcile && (
                <button
                  type="button"
                  disabled={reconciling}
                  onClick={onReconcile}
                  className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-[#1B4D3E] bg-white px-3.5 py-2 text-xs font-bold text-[#1B4D3E] hover:bg-[#EEF4F1] disabled:opacity-60"
                >
                  {reconciling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  <span>Cek Status Pembayaran</span>
                </button>
              )}
              {onRecoveryAction && (
                <button
                  type="button"
                  onClick={onRecoveryAction}
                  className="inline-flex min-h-[40px] items-center justify-center rounded-xl bg-[#1B4D3E] px-4 py-2 text-xs font-bold text-white hover:bg-[#143B2F]"
                >
                  {recoveryLabel}
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Active Pending Dynamic QRIS */}
            <div className="flex flex-col items-center rounded-2xl border border-[#E8E6DF] bg-[#FAF9F6] p-4">
              <div className="flex items-center gap-2 text-[11px] font-extrabold tracking-wider text-[#1B4D3E] uppercase">
                <span>QRIS Nasional Dinamis</span>
                {isSandbox && (
                  <span className="rounded bg-[#FCD804] px-1.5 py-0.5 text-[10px] text-[#252525]">
                    MIDTRANS SANDBOX
                  </span>
                )}
              </div>

              <div className="mt-3 rounded-2xl border border-[#E8E6DF] bg-white p-3 shadow-[0_6px_18px_rgba(37,37,37,0.06)]">
                {qrString ? (
                  <QrCodeCanvas
                    value={qrString}
                    size={compact ? 176 : 204}
                    darkColor="#252525"
                    alt={`QRIS Otomatis ${merchantName}`}
                  />
                ) : qrImageUrl ? (
                  <img
                    src={qrImageUrl}
                    alt={`QRIS Otomatis ${merchantName}`}
                    className={compact ? 'h-44 w-44 object-contain' : 'h-[204px] w-[204px] object-contain'}
                  />
                ) : (
                  <div className="grid h-44 w-44 place-items-center text-xs text-[#5C5952]">
                    Memuat kode QRIS…
                  </div>
                )}
              </div>

              <ol className="mt-3.5 w-full max-w-xs space-y-1 text-left text-xs text-[#5C5952] list-decimal list-inside">
                <li>
                  {isSandbox
                    ? 'Salin URL gambar QR di bawah lalu tempel ke Midtrans QRIS Simulator.'
                    : 'Buka aplikasi mobile banking atau e-wallet pendukung QRIS.'}
                </li>
                <li>Pastikan nominal tepat {formatRupiah(amount)} untuk {merchantName}.</li>
                <li>Status pesanan otomatis berubah menjadi Lunas setelah dana terverifikasi.</li>
              </ol>

              {isSandbox && simulatorValueToCopy && (
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2 w-full">
                  <button
                    type="button"
                    onClick={() => void handleCopySimulatorRef()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#E8E6DF] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#1B4D3E] hover:bg-[#EEF4F1]"
                  >
                    {copiedSimRef ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{copiedSimRef ? 'Data QR Disalin' : qrImageUrl ? 'Salin URL Gambar QR' : 'Salin String QR'}</span>
                  </button>
                  <a
                    href="https://simulator.sandbox.midtrans.com/v2/qris/index"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg border border-[#E8E6DF] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#252525] hover:bg-[#FAF9F6]"
                  >
                    <span>Buka Simulator Midtrans</span>
                    <ExternalLink className="h-3 w-3 text-[#1B4D3E]" />
                  </a>
                </div>
              )}
            </div>

            {reconcileMessage && (
              <p role="status" className="text-center text-xs font-semibold text-[#5C5952]">
                {reconcileMessage}
              </p>
            )}

            {onReconcile && (
              <button
                type="button"
                disabled={reconciling}
                onClick={onReconcile}
                className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl border border-[#1B4D3E] bg-white px-4 py-2.5 text-xs sm:text-sm font-bold text-[#1B4D3E] hover:bg-[#EEF4F1] disabled:opacity-60 transition-colors"
              >
                {reconciling ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                <span>{reconciling ? 'Memeriksa ke Midtrans…' : 'Cek Status Pembayaran'}</span>
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};
