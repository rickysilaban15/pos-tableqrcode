import type { CafeTable, Order, PaymentMethod } from '../types/pos';

export function formatRupiah(amount: number): string {
  const safe = Number.isFinite(amount) ? Math.round(amount) : 0;
  return `Rp${safe.toLocaleString('id-ID')}`;
}

export function formatTime(isoString: string): string {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function formatDateTime(isoString: string): string {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function generateTableToken(tableName: string): string {
  const cleanName = tableName.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6) || 'TBL';
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let rand = '';
  for (let i = 0; i < 6; i += 1) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `LRS-${cleanName}-${rand}`;
}

export function isValidTokenFormat(token: string): boolean {
  return /^LRS-[A-Z0-9]{1,8}-[A-Z0-9]{4,10}$/i.test(token.trim());
}

export function generateOrderId(sequence: number): string {
  const year = new Date().getFullYear();
  const padded = String(sequence).padStart(4, '0');
  return `ORD-${year}-${padded}`;
}

export function normalizeBaseUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim().replace(/\/+$/, '');
  if (!trimmed) {
    return typeof window !== 'undefined' ? window.location.origin : '';
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    return `http://${trimmed}`;
  }
  return trimmed;
}

export function buildTableQrUrl(
  baseUrl: string,
  storeSlug: string,
  table: Pick<CafeTable, 'name' | 'token'>,
): string {
  const cleanBase = normalizeBaseUrl(baseUrl);
  const slug = encodeURIComponent(storeSlug || 'laris-coffee');
  const params = new URLSearchParams({
    table: table.name,
    token: table.token,
  });
  return `${cleanBase}/order/${slug}?${params.toString()}`;
}

export function isLocalhostUrl(url: string): boolean {
  const lower = url.trim().toLowerCase();
  return (
    lower.includes('://localhost') ||
    lower.includes('://127.0.0.1') ||
    lower.includes('://0.0.0.0') ||
    lower === 'localhost' ||
    lower.startsWith('localhost:')
  );
}

export function isPrivateAiStudioDevUrl(url: string): boolean {
  const lower = url.trim().toLowerCase();
  return /^https?:\/\/ais-dev-/i.test(lower) || lower.startsWith('ais-dev-');
}

export function getQrUrlWarning(
  url: string,
): { type: 'localhost' | 'private_dev'; title: string; detail: string } | null {
  if (isLocalhostUrl(url)) {
    return {
      type: 'localhost',
      title: 'Base URL masih mengarah ke localhost / 127.0.0.1.',
      detail:
        'Kamera HP tidak bisa membuka halaman jika QR berisi localhost. Ganti dengan URL publik aplikasi atau IP jaringan lokal Anda (mis. http://192.168.x.x:3000).',
    };
  }
  if (isPrivateAiStudioDevUrl(url)) {
    return {
      type: 'private_dev',
      title: 'Base URL masih menggunakan link preview privat (ais-dev-...).',
      detail:
        'Link preview editor bersifat privat sehingga scan dari HP akan memunculkan error 403 (You don\'t have access). Buka halaman Admin melalui link Publish/Share publik (QR otomatis menyesuaikan), atau tempelkan URL publik aplikasi pada kolom Base URL lalu simpan.',
    };
  }
  return null;
}

export function getPaymentMethodLabel(method: PaymentMethod, subMethod?: string): string {
  switch (method) {
    case 'QRIS':
      return 'QRIS';
    case 'E_WALLET':
      return subMethod ? `E-Wallet (${subMethod})` : 'E-Wallet';
    case 'BANK_TRANSFER':
      return subMethod ? `Transfer Bank (${subMethod})` : 'Transfer Bank';
    case 'CASHIER':
      return 'Bayar di Kasir';
  }
}

export function getOrderTypeLabel(orderType: Order['orderType']): string {
  return orderType === 'DINE_IN' ? 'Dine In' : 'Takeaway';
}

export function getFulfillmentLabel(method: Order['fulfillmentMethod']): string {
  return method === 'TABLE_SERVICE' ? 'Antar ke Meja' : 'Pickup Counter';
}
