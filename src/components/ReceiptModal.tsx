import React, { useState } from 'react';
import { Printer, X } from 'lucide-react';
import { formatDateTime, formatRupiah } from '../utils/format';

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

  if (!receipt) return null;

  const shortNo = `INV-${receipt.id.slice(0, 8).toUpperCase()}`;
  const isThermal = paperMode !== 'digital';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px] print:static print:bg-white print:p-0"
      role="dialog"
      aria-modal="true"
      aria-label="Struk transaksi"
    >
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[#E8E6DF] bg-white shadow-2xl print:max-h-none print:max-w-none print:overflow-visible print:border-0 print:shadow-none">
        <div className="no-print sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-[#E8E6DF] bg-white px-5 py-3.5">
          <div className="flex items-center gap-1 rounded-xl border border-[#E8E6DF] bg-[#FAF9F6] p-1 text-xs font-semibold">
            {([
              ['digital', 'Digital'],
              ['58mm', 'Thermal 58mm'],
              ['80mm', 'Thermal 80mm'],
            ] as const).map(([mode, text]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setPaperMode(mode)}
                className={`rounded-lg px-2.5 py-1.5 transition-colors ${
                  paperMode === mode ? 'bg-[#1B4D3E] text-white' : 'text-[#64625C] hover:text-[#252525]'
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
              className="grid h-9 w-9 place-items-center rounded-xl border border-[#E8E6DF] text-[#64625C] hover:bg-[#FAF9F6]"
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
              <h3 className={`font-extrabold tracking-tight text-[#1B4D3E] ${isThermal ? 'text-sm' : 'text-lg'}`}>
                {receipt.merchantName}
              </h3>
              {receipt.outletName && <p className="text-xs text-[#64625C]">{receipt.outletName}</p>}
              {receipt.address && <p className="mt-0.5 text-[11px] text-[#64625C]">{receipt.address}</p>}
              {receipt.whatsapp && <p className="text-[11px] text-[#64625C]">WA: {receipt.whatsapp}</p>}
            </header>

            <dl className="mt-3 space-y-1 border-b border-dashed border-[#CFCBC0] pb-3 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-[#64625C]">No. Struk</dt>
                <dd className="font-mono font-bold tabular-nums">{shortNo}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[#64625C]">Waktu</dt>
                <dd className="font-mono tabular-nums">{formatDateTime(receipt.createdAt)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[#64625C]">Pelanggan</dt>
                <dd className="font-semibold">{receipt.customerName}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[#64625C]">Sumber / Layanan</dt>
                <dd className="font-semibold">
                  {receipt.orderSource === 'POS' ? 'Kasir POS' : 'QR Meja'} ·{' '}
                  {receipt.orderType === 'TAKEAWAY' ? 'Takeaway' : `Dine In${receipt.tableName ? ` (${receipt.tableName})` : ''}`}
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
                        <span className="font-mono tabular-nums">{item.quantity}x </span>
                        {item.productName}
                      </div>
                      {details.length > 0 && <div className="text-[11px] text-[#64625C]">{details.join(' · ')}</div>}
                      {item.selections?.note && <div className="text-[11px] italic text-[#64625C]">Catatan: {item.selections.note}</div>}
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
                <dt className="text-[#64625C]">Pembayaran</dt>
                <dd className="font-semibold">
                  {receipt.method === 'CASH' ? 'Tunai' : 'QRIS'} ({receipt.paymentStatus === 'PAID' ? 'LUNAS' : 'MENUNGGU'})
                </dd>
              </div>
              {receipt.cashReceived != null && (
                <div className="flex justify-between">
                  <dt className="text-[#64625C]">Tunai Diterima</dt>
                  <dd className="font-mono tabular-nums">{formatRupiah(receipt.cashReceived)}</dd>
                </div>
              )}
              {receipt.changeAmount != null && receipt.changeAmount > 0 && (
                <div className="flex justify-between">
                  <dt className="text-[#64625C]">Kembalian</dt>
                  <dd className="font-mono tabular-nums">{formatRupiah(receipt.changeAmount)}</dd>
                </div>
              )}
              {receipt.paidAt && (
                <div className="flex justify-between">
                  <dt className="text-[#64625C]">Terverifikasi</dt>
                  <dd className="font-mono tabular-nums">{formatDateTime(receipt.paidAt)}</dd>
                </div>
              )}
            </dl>

            <footer className="mt-4 border-t border-dashed border-[#CFCBC0] pt-3 text-center text-[11px] text-[#64625C]">
              Terima kasih telah memesan di {receipt.merchantName}.
            </footer>
          </article>
        </div>
      </div>
    </div>
  );
};
