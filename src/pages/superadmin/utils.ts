export function formatRp(amount: number): string {
  if (amount >= 1_000_000_000) return `Rp${(amount / 1_000_000_000).toFixed(1)}M`;
  if (amount >= 1_000_000) return `Rp${(amount / 1_000_000).toFixed(1)}jt`;
  if (amount >= 1_000) return `Rp${(amount / 1_000).toFixed(0)}rb`;
  return `Rp${amount.toLocaleString('id-ID')}`;
}

export function formatRpFull(amount: number): string {
  return `Rp${amount.toLocaleString('id-ID')}`;
}

export function formatDate(iso: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: '2-digit' });
  } catch {
    return iso;
  }
}

export function formatDateTime(iso: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}
