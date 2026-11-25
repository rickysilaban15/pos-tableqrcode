import React from 'react';
import type { CashierStatus, OrderStatus, PaymentStatus } from '../types/pos';

export const OrderStatusBadge: React.FC<{ status: OrderStatus }> = ({ status }) => {
  const styles: Record<OrderStatus, { label: string; cls: string }> = {
    ORDER_BARU: {
      label: 'Order Baru',
      cls: 'bg-[#1B4D3E]/10 text-[#1B4D3E] border-[#1B4D3E]/20',
    },
    MEMASAK: {
      label: 'Memasak',
      cls: 'bg-[#FCD804]/30 text-[#252525] border-[#D9B800]/40',
    },
    DISAJIKAN: {
      label: 'Disajikan',
      cls: 'bg-[#E9F5EE] text-[#15623A] border-[#B8E1C8]',
    },
  };

  const current = styles[status];
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-md border text-xs font-semibold whitespace-nowrap shrink-0 ${current.cls}`}
    >
      {current.label}
    </span>
  );
};

export const PaymentStatusBadge: React.FC<{ status: PaymentStatus }> = ({ status }) => {
  const styles: Record<PaymentStatus, { label: string; cls: string }> = {
    LUNAS: {
      label: 'Lunas',
      cls: 'bg-[#E9F5EE] text-[#15623A] border-[#B8E1C8]',
    },
    BELUM_DIBAYAR: {
      label: 'Belum Dibayar',
      cls: 'bg-[#FEF3E6] text-[#9A520A] border-[#F6D3AE]',
    },
    GAGAL: {
      label: 'Gagal',
      cls: 'bg-[#FDECEC] text-[#A62626] border-[#F6C5C5]',
    },
  };

  const current = styles[status];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md border text-xs font-medium whitespace-nowrap shrink-0 ${current.cls}`}
    >
      {current.label}
    </span>
  );
};

export const CashierStatusBadge: React.FC<{ status: CashierStatus }> = ({ status }) => {
  const isDone = status === 'SELESAI';
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md border text-xs font-medium whitespace-nowrap shrink-0 ${
        isDone
          ? 'bg-[#252525]/5 text-[#252525] border-[#D9D6CD]'
          : 'bg-white text-[#64625C] border-[#E8E6DF]'
      }`}
    >
      {isDone ? 'Kasir Selesai' : 'Kasir Aktif'}
    </span>
  );
};
