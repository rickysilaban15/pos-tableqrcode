import React from 'react';

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  ACTIVE:    { label: 'Active',    cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20' },
  TRIAL:     { label: 'Trial',     cls: 'bg-blue-500/15 text-blue-300 border-blue-500/20' },
  EXPIRED:   { label: 'Expired',   cls: 'bg-orange-500/15 text-orange-300 border-orange-500/20' },
  SUSPENDED: { label: 'Suspended', cls: 'bg-red-500/15 text-red-300 border-red-500/20' },
  CANCELLED: { label: 'Cancelled', cls: 'bg-white/8 text-white/40 border-white/10' },
};

export const SubStatusBadge: React.FC<{ status: string | null }> = ({ status }) => {
  const cfg = STATUS_MAP[status ?? ''] ?? { label: status ?? 'No Sub', cls: 'bg-white/5 text-white/30 border-white/8' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-xs font-semibold whitespace-nowrap ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
};
