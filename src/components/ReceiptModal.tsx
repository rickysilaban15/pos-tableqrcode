import React, { useEffect, useState } from 'react';
import { Printer, X, CheckCircle2 } from 'lucide-react';
import { formatDateTime, formatRupiah } from '../utils/format';
import { BrandMark } from './BrandMark';

export interface ReceiptItemData {
  productName: string;
  unitPrice: number;
  quantity: number;
  selections?: {
    variants?: { option_name?: string; optionName?: string }[];
    addons?: { name: string }[];
    note?: string;
  };
}

export interface ReceiptData {
  id: string;
  merchantName: string;
  outletName?: string;
  address?: string;
  whatsapp?: string;
  logoUrl?: string;
  customerName: string;
  orderType?: 'DINE_IN' | 'TAKEAWAY';
  fulfillmentMethod?: 'TABLE_SERVICE' | 'PICKUP_COUNTER';
  orderSource?: 'QR' | 'POS';
  tableName?: string | null;
  orderStatus: string;
  paymentStatus: string;
  method: 'CASH' | 'QRIS' | string;
  cashReceived?: number | null;
  changeAmount?: number | null;
  totalAmount: number;
  createdAt: string;
  paidAt?: string | null;
  completedAt?: string | null;
  items: ReceiptItemData[];
}

interface ReceiptModalProps {
  receipt: ReceiptData | null;
  onClose: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({ receipt, onClose }) => {
  const [paperMode, setPaperMode] = useState<'digital' | '58mm' | '80mm'>('digital');

  useEffect(() => {
    if (!receipt) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [receipt, onClose]);

  if (!receipt) return null;

  const shortNo = `INV-${receipt.id.slice(0, 8).toUpperCase()}`;
  const isThermal = paperMode !== 'digital';
  const isPaid = receipt.paymentStatus === 'PAID' || receipt.paymentStatus === 'LUNAS';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px] print:static print:bg-white print:p-0"
      role="dialog"
      aria-modal="true"
      aria-label="Struk transaksi"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[#E8E6DF] bg-white shadow-[0_24px_56px_rgba(37,37,37,0.2)] print:max-h-none print:max-w-none print:overflow-visible print:border-0 print:shadow-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="no-print sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-[#E8E6DF] bg-white px-5 py-3.5">
          <div className="flex items-center gap-1 rounded-xl border border-[#E8E6DF] bg-[#FAF9F6] p-1 text-xs font-semibold">
            {(
              [
                ['digital', 'Digital'],
                ['58mm', 'Thermal 58mm'],
                ['80mm', 'Thermal 80mm'],
              ] as const
            ).map(([mode, text]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setPaperMode(mode)}
                className={`rounded-lg px-2.5 py-1.5 transition-colors ${
                  paperMode === mode ? 'bg-[#1B4D3E] text-white' : 'text-[#5C5952] hover:text-[#252525]'
                }`}
              >
                {text}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#1B4D3E] px-3.5 py-2 text-xs font-bold text-white hover:bg-[#143B2F]"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>Cetak Struk</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup struk"
              className="grid h-9 w-9 place-items-center rounded-xl border border-[#E8E6DF] text-[#5C5952] hover:bg-[#FAF9F6]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="p-5 sm:p-6 print:p-0">
          <article
            className={`receipt-print-only mx-auto rounded-2xl border border-[#E8E6DF] bg-[#FAF9F6] p-5 text-[#252525] ${
              paperMode === '58mm'
                ? 'receipt-thermal-58 max-w-[260px] font-mono text-[11px]'
                : paperMode === '80mm'
                  ? 'receipt-thermal-80 max-w-[340px] font-mono text-xs'
                  : 'w-full text-sm'
            }`}
          >
            <header className="border-b border-dashed border-[#CFCBC0] pb-3.5 text-center">
              {!isThermal && (
                <div className="mb-2 flex justify-center">
                  <BrandMark logoUrl={receipt.logoUrl} size="sm" />
                </div>
              )}
              <h3 className={`font-extrabold tracking-tight text-[#1B4D3E] ${isThermal ? 'text-sm' : 'text-lg'}`}>
                {receipt.merchantName}
              </h3>
              {receipt.outletName && <p className="text-xs text-[#5C5952]">{receipt.outletName}</p>}
              {receipt.address && <p className="mt-0.5 text-[11px] text-[#5C5952]">{receipt.address}</p>}
              {receipt.whatsapp && <p className="text-[11px] text-[#5C5952]">WA: {receipt.whatsapp}</p>}
              {isPaid && !isThermal && (
                <div className="mt-2.5 inline-flex items-center gap-1 rounded-full bg-[#E9F5EE] border border-[#B8E1C8] px-2.5 py-0.5 text-[11px] font-bold text-[#15623A]">
                  <CheckCircle2 className="h-3 w-3" />
                  <span>PEMBAYARAN LUNAS TERVERIFIKASI</span>
                </div>
              )}
            </header>

            <dl className="mt-3 space-y-1 border-b border-dashed border-[#CFCBC0] pb-3 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-[#5C5952]">No. Struk</dt>
                <dd className="font-mono font-bold tabular-nums">{shortNo}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[#5C5952]">Waktu</dt>
                <dd className="font-mono tabular-nums">{formatDateTime(receipt.createdAt)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[#5C5952]">Pelanggan</dt>
                <dd className="font-semibold text-right">{receipt.customerName}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[#5C5952]">Sumber / Layanan</dt>
                <dd className="font-semibold text-right">
                  {receipt.orderSource === 'POS' ? 'Kasir POS' : 'QR Meja'} ·{' '}
                  {receipt.orderType === 'TAKEAWAY'
                    ? 'Takeaway'
                    : `Dine In${receipt.tableName ? ` (${receipt.tableName})` : ''}`}
                </dd>
              </div>
            </dl>

            <ul className="mt-3 space-y-2 border-b border-dashed border-[#CFCBC0] pb-3">
              {receipt.items.map((item, idx) => {
                const details = [
                  ...(item.selections?.variants ?? []).map((v) => v.optionName ?? v.option_name ?? ''),
                  ...(item.selections?.addons ?? []).map((a) => `+ ${a.name}`),
                ].filter(Boolean);
                return (
                  <li key={`${receipt.id}-item-${idx}`} className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold">
                        <span className="font-mono tabular-nums text-[#1B4D3E]">{item.quantity}x </span>
                        {item.productName}
                      </div>
                      {details.length > 0 && <div className="text-[11px] text-[#5C5952]">{details.join(' · ')}</div>}
                      {item.selections?.note && (
                        <div className="text-[11px] italic text-[#5C5952]">Catatan: {item.selections.note}</div>
                      )}
                    </div>
                    <span className="shrink-0 font-mono font-semibold tabular-nums">
                      {formatRupiah(item.unitPrice * item.quantity)}
                    </span>
                  </li>
                );
              })}
            </ul>

            <dl className="mt-3 space-y-1.5 text-xs">
              <div className="flex justify-between text-sm font-extrabold text-[#1B4D3E]">
                <dt>TOTAL NETT</dt>
                <dd className="font-mono tabular-nums">{formatRupiah(receipt.totalAmount)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#5C5952]">Pembayaran</dt>
                <dd className="font-semibold">
                  {receipt.method === 'CASH' || receipt.method === 'CASHIER' ? 'Tunai' : 'QRIS'} (
                  {isPaid ? 'LUNAS' : receipt.paymentStatus === 'REFUNDED' ? 'REFUND' : 'MENUNGGU'})
                </dd>
              </div>
              {receipt.cashReceived != null && (
                <div className="flex justify-between">
                  <dt className="text-[#5C5952]">Tunai Diterima</dt>
                  <dd className="font-mono tabular-nums">{formatRupiah(receipt.cashReceived)}</dd>
                </div>
              )}
              {receipt.changeAmount != null && receipt.changeAmount >= 0 && isPaid && (receipt.method === 'CASH' || receipt.method === 'CASHIER') && (
                <div className="flex justify-between">
                  <dt className="text-[#5C5952]">Kembalian</dt>
                  <dd className="font-mono tabular-nums">{formatRupiah(receipt.changeAmount)}</dd>
                </div>
              )}
              {receipt.paidAt && (
                <div className="flex justify-between">
                  <dt className="text-[#5C5952]">Terverifikasi</dt>
                  <dd className="font-mono tabular-nums">{formatDateTime(receipt.paidAt)}</dd>
                </div>
              )}
            </dl>

            <footer className="mt-4 border-t border-dashed border-[#CFCBC0] pt-3 text-center text-[11px] text-[#5C5952]">
              <p>Terima kasih telah memesan di {receipt.merchantName}.</p>
              <p className="mt-0.5 font-mono text-[10px] text-[#8C8980]">Powered by WarkopOS</p>
            </footer>
          </article>
        </div>
      </div>
    </div>
  );
};
