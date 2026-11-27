import { createHash, timingSafeEqual } from 'node:crypto';
import { getMidtransReadiness, type MidtransReadiness } from '../../config/env.ts';

export type ProviderTransactionDisposition =
  | 'PENDING'
  | 'SETTLED'
  | 'EXPIRED'
  | 'FAILED'
  | 'REFUNDED';

export interface ChargeItemInput {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

export interface ChargeDynamicQrisInput {
  providerOrderId: string;
  grossAmount: number;
  customerName: string;
  items: ChargeItemInput[];
  expiryMinutes?: number;
}

export interface ChargeDynamicQrisResult {
  provider: 'MIDTRANS';
  environment: 'SANDBOX';
  providerOrderId: string;
  providerTransactionId: string;
  providerStatus: string;
  qrString: string | null;
  qrImageUrl: string | null;
  acquirer: string;
  expiresAt: Date;
  providerMetadata: Record<string, unknown>;
}

export interface MidtransStatusResponse {
  found: boolean;
  statusCode: string;
  statusMessage: string;
  transactionId: string | null;
  orderId: string | null;
  merchantId: string | null;
  grossAmountRaw: string | null;
  grossAmountInt: number | null;
  currency: string;
  paymentType: string | null;
  transactionStatus: string;
  fraudStatus: string | null;
  acquirer: string | null;
  transactionTime: Date | null;
  settlementTime: Date | null;
  expiryTime: Date | null;
  disposition: ProviderTransactionDisposition;
}

const PROVIDER_ORDER_ID_RE = /^[A-Za-z0-9_-]{4,80}$/;
const HEX_SHA512_RE = /^[a-f0-9]{128}$/i;

export function resolveMidtransApiBaseUrl(rawEnv: NodeJS.ProcessEnv = process.env): string {
  const readiness = getMidtransReadiness(rawEnv);
  if (readiness.productionBlockedReason) {
    throw Object.assign(new Error(readiness.productionBlockedReason), { status: 503 });
  }
  // Allow local mock server override strictly in automated test environments
  if (rawEnv.NODE_ENV === 'test' && rawEnv.MIDTRANS_API_BASE_URL) {
    return rawEnv.MIDTRANS_API_BASE_URL.replace(/\/+$/, '');
  }
  return 'https://api.sandbox.midtrans.com';
}

export function isMerchantEligibleForDynamicQris(
  merchantId: string,
  merchantSlug: string,
  outletEnableDynamicQris = true,
  rawEnv: NodeJS.ProcessEnv = process.env,
): { eligible: boolean; reason: string | null; readiness: MidtransReadiness } {
  const readiness = getMidtransReadiness(rawEnv);
  if (!readiness.enabledFlag) {
    return {
      eligible: false,
      reason: 'MIDTRANS_ENABLED bernilai false pada konfigurasi server.',
      readiness,
    };
  }
  if (readiness.productionBlockedReason) {
    return {
      eligible: false,
      reason: readiness.productionBlockedReason,
      readiness,
    };
  }
  if (!readiness.ready || !readiness.designatedMerchantRef) {
    return {
      eligible: false,
      reason: readiness.warnings[0] || 'Konfigurasi Midtrans Sandbox belum lengkap di server.',
      readiness,
    };
  }
  const ref = readiness.designatedMerchantRef.toLowerCase();
  const matchesMerchant =
    merchantId.toLowerCase() === ref || (merchantSlug && merchantSlug.toLowerCase() === ref);
  if (!matchesMerchant) {
    return {
      eligible: false,
      reason:
        'Akun Midtrans Sandbox server tidak ditautkan ke merchant ini (isolasi kredensial multi-tenant aktif).',
      readiness,
    };
  }
  if (!outletEnableDynamicQris) {
    return {
      eligible: false,
      reason: 'QRIS Otomatis dinonaktifkan pada pengaturan outlet ini.',
      readiness,
    };
  }
  return { eligible: true, reason: null, readiness };
}

/**
 * Parses Midtrans Core API timestamps ("yyyy-MM-dd HH:mm:ss" in GMT+7 WIB,
 * "yyyy-MM-dd HH:mm:ss +0700", or ISO-8601).
 */
export function parseMidtransTimestamp(raw?: string | null): Date | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Format: "2026-11-27 08:15:00" (Midtrans GMT+7 local timestamp)
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)) {
    const parsed = new Date(`${trimmed.replace(' ', 'T')}+07:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  // Format: "2026-11-27 08:15:00 +0700"
  const withOffset = trimmed.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})$/);
  if (withOffset) {
    const parsed = new Date(`${withOffset[1]}T${withOffset[2]}${withOffset[3]}:${withOffset[4]}`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const fallback = new Date(trimmed);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

export function mapMidtransTransactionState(
  transactionStatus: string,
  fraudStatus?: string | null,
): ProviderTransactionDisposition {
  const status = (transactionStatus || '').trim().toLowerCase();
  const fraud = (fraudStatus || '').trim().toLowerCase();

  if (fraud === 'deny') return 'FAILED';
  if (status === 'settlement') {
    return !fraud || fraud === 'accept' ? 'SETTLED' : 'PENDING';
  }
  if (status === 'capture') {
    return fraud === 'accept' ? 'SETTLED' : 'PENDING';
  }
  if (status === 'expire') return 'EXPIRED';
  if (status === 'deny' || status === 'cancel' || status === 'failure') return 'FAILED';
  if (status === 'refund' || status === 'partial_refund' || status === 'chargeback') return 'REFUNDED';
  return 'PENDING';
}

/**
 * Verifies non-BI-SNAP Midtrans Core API v2 HTTPS notification signature:
 * SHA512(order_id + status_code + gross_amount + SecretKey)
 * Uses constant-time comparison and never logs secrets.
 */
export function verifyMidtransWebhookSignature(
  payload: {
    order_id?: unknown;
    status_code?: unknown;
    gross_amount?: unknown;
    signature_key?: unknown;
  },
  rawEnv: NodeJS.ProcessEnv = process.env,
): boolean {
  const readiness = getMidtransReadiness(rawEnv);
  if (!readiness.enabledFlag || readiness.productionBlockedReason) return false;

  const secretKey = (rawEnv.MIDTRANS_SIGNATURE_KEY || rawEnv.MIDTRANS_SERVER_KEY || '').trim();
  if (secretKey.length < 12 || secretKey.includes('replace-with')) return false;

  const orderId = typeof payload.order_id === 'string' ? payload.order_id : '';
  const statusCode = typeof payload.status_code === 'string' ? payload.status_code : '';
  const grossAmount = typeof payload.gross_amount === 'string' ? payload.gross_amount : '';
  const receivedSig = typeof payload.signature_key === 'string' ? payload.signature_key.trim().toLowerCase() : '';

  if (!orderId || !statusCode || !grossAmount || !HEX_SHA512_RE.test(receivedSig)) {
    return false;
  }

  const computedSig = createHash('sha512')
    .update(`${orderId}${statusCode}${grossAmount}${secretKey}`)
    .digest('hex')
    .toLowerCase();

  const a = Buffer.from(computedSig, 'utf8');
  const b = Buffer.from(receivedSig, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function buildBasicAuthHeader(rawEnv: NodeJS.ProcessEnv = process.env): string {
  const readiness = getMidtransReadiness(rawEnv);
  if (!readiness.ready) {
    throw Object.assign(
      new Error(readiness.warnings[0] || 'Midtrans Sandbox belum dikonfigurasi dengan benar.'),
      { status: 503 },
    );
  }
  const serverKey = (rawEnv.MIDTRANS_SERVER_KEY ?? '').trim();
  return `Basic ${Buffer.from(`${serverKey}:`).toString('base64')}`;
}

export function parseStrictGrossAmount(raw: unknown): number | null {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const text = String(raw).trim();
  if (!/^\d+(\.00)?$/.test(text)) return null;
  const num = Number(text);
  return Number.isSafeInteger(num) && num >= 0 ? num : null;
}

/**
 * Calls Midtrans Core API v2 `POST /v2/charge` to create a real Sandbox Dynamic QRIS payment.
 */
export async function chargeMidtransDynamicQris(
  input: ChargeDynamicQrisInput,
  rawEnv: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<ChargeDynamicQrisResult> {
  if (!PROVIDER_ORDER_ID_RE.test(input.providerOrderId)) {
    throw Object.assign(new Error('Format providerOrderId tidak valid'), { status: 400 });
  }
  if (!Number.isInteger(input.grossAmount) || input.grossAmount <= 0 || input.grossAmount > 50_000_000) {
    throw Object.assign(new Error('Nominal pembayaran QRIS tidak valid'), { status: 400 });
  }
  const itemsSum = input.items.reduce((acc, it) => acc + it.price * it.quantity, 0);
  if (itemsSum !== input.grossAmount) {
    throw Object.assign(new Error('Total rincian item tidak cocok dengan gross_amount'), { status: 400 });
  }

  const baseUrl = resolveMidtransApiBaseUrl(rawEnv);
  const authHeader = buildBasicAuthHeader(rawEnv);
  const readiness = getMidtransReadiness(rawEnv);
  const expiryMinutes = Math.min(60, Math.max(1, input.expiryMinutes ?? 15));

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: authHeader,
  };
  if (readiness.webhookHttpsValid && readiness.webhookBaseUrl) {
    headers['X-Override-Notification'] = `${readiness.webhookBaseUrl}/api/webhooks/midtrans`;
  }

  const requestBody = {
    payment_type: 'qris',
    transaction_details: {
      order_id: input.providerOrderId,
      gross_amount: input.grossAmount,
    },
    item_details: input.items.map((it) => ({
      id: it.id.slice(0, 50),
      price: it.price,
      quantity: it.quantity,
      name: (it.name.trim() || 'Menu Item').slice(0, 50),
    })),
    customer_details: {
      first_name: (input.customerName.trim() || 'Pelanggan').slice(0, 50),
    },
    qris: {
      acquirer: 'gopay',
    },
    custom_expiry: {
      expiry_duration: expiryMinutes,
      unit: 'minute',
    },
  };

  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl}/v2/charge`, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    const isTimeout = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    throw Object.assign(
      new Error(
        isTimeout
          ? 'Permintaan ke Midtrans Sandbox melewati batas waktu. Silakan coba lagi.'
          : 'Gagal menghubungi layanan Midtrans Sandbox.',
      ),
      { status: 502, code: isTimeout ? 'PROVIDER_TIMEOUT' : 'PROVIDER_NETWORK_ERROR' },
    );
  }

  const data = (await response.json().catch(() => null)) as Record<string, any> | null;
  if (!response.ok || !data || String(data.status_code) !== '201') {
    const providerMsg =
      typeof data?.status_message === 'string' ? data.status_message : `HTTP ${response.status}`;
    throw Object.assign(
      new Error(`Gagal membuat QRIS Otomatis di Midtrans Sandbox (${providerMsg}).`),
      { status: 502, code: 'PROVIDER_CHARGE_REJECTED' },
    );
  }

  const responseGross = parseStrictGrossAmount(data.gross_amount);
  if (responseGross !== input.grossAmount) {
    throw Object.assign(new Error('Nominal gross_amount dari penyedia tidak sesuai pesanan'), {
      status: 502,
      code: 'PROVIDER_AMOUNT_MISMATCH',
    });
  }

  const actions: Array<{ name?: string; url?: string }> = Array.isArray(data.actions) ? data.actions : [];
  const qrActionV2 = actions.find((a) => a?.name === 'generate-qr-code-v2' && typeof a.url === 'string');
  const qrActionV1 = actions.find((a) => a?.name === 'generate-qr-code' && typeof a.url === 'string');
  const qrString = typeof data.qr_string === 'string' && data.qr_string.trim() ? data.qr_string.trim() : null;
  const qrImageUrl = (qrActionV2?.url || qrActionV1?.url || '').trim() || null;

  if (!qrString && !qrImageUrl) {
    throw Object.assign(new Error('Midtrans Sandbox tidak mengembalikan payload QRIS yang valid.'), {
      status: 502,
      code: 'PROVIDER_MISSING_QR',
    });
  }

  const providerTransactionId =
    typeof data.transaction_id === 'string' && data.transaction_id.trim() ? data.transaction_id.trim() : '';
  if (!providerTransactionId) {
    throw Object.assign(new Error('Midtrans Sandbox tidak mengembalikan transaction_id.'), {
      status: 502,
      code: 'PROVIDER_MISSING_TX_ID',
    });
  }

  const expiresAt =
    parseMidtransTimestamp(typeof data.expiry_time === 'string' ? data.expiry_time : null) ??
    new Date(Date.now() + expiryMinutes * 60_000);

  return {
    provider: 'MIDTRANS',
    environment: 'SANDBOX',
    providerOrderId: String(data.order_id || input.providerOrderId),
    providerTransactionId,
    providerStatus: String(data.transaction_status || 'pending').toLowerCase(),
    qrString,
    qrImageUrl,
    acquirer: typeof data.acquirer === 'string' && data.acquirer ? data.acquirer : 'gopay',
    expiresAt,
    providerMetadata: {
      statusCode: String(data.status_code),
      statusMessage: typeof data.status_message === 'string' ? data.status_message : '',
      providerMerchantId: typeof data.merchant_id === 'string' ? data.merchant_id : null,
      transactionTime: typeof data.transaction_time === 'string' ? data.transaction_time : null,
      expiryTimeRaw: typeof data.expiry_time === 'string' ? data.expiry_time : null,
      fraudStatus: typeof data.fraud_status === 'string' ? data.fraud_status : null,
      actions: actions
        .filter((a) => typeof a?.name === 'string' && typeof a?.url === 'string')
        .map((a) => ({ name: a.name, url: a.url })),
    },
  };
}

/**
 * Queries authoritative transaction status from Midtrans Core API v2 `GET /v2/{order_id}/status`.
 */
export async function fetchMidtransTransactionStatus(
  providerOrderId: string,
  rawEnv: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<MidtransStatusResponse> {
  if (!PROVIDER_ORDER_ID_RE.test(providerOrderId)) {
    throw Object.assign(new Error('Format providerOrderId tidak valid'), { status: 400 });
  }
  const baseUrl = resolveMidtransApiBaseUrl(rawEnv);
  const authHeader = buildBasicAuthHeader(rawEnv);

  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl}/v2/${encodeURIComponent(providerOrderId)}/status`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: authHeader,
      },
      signal: AbortSignal.timeout(8_000),
    });
  } catch (err) {
    const isTimeout = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    throw Object.assign(
      new Error(
        isTimeout
          ? 'Pengecekan status Midtrans melewati batas waktu.'
          : 'Gagal menghubungi endpoint status Midtrans Sandbox.',
      ),
      { status: 502, code: isTimeout ? 'PROVIDER_TIMEOUT' : 'PROVIDER_NETWORK_ERROR' },
    );
  }

  const data = (await response.json().catch(() => null)) as Record<string, any> | null;
  if (!data) {
    throw Object.assign(new Error('Respons status Midtrans tidak valid.'), {
      status: 502,
      code: 'PROVIDER_INVALID_JSON',
    });
  }

  const statusCode = String(data.status_code ?? response.status);
  if (statusCode === '404') {
    return {
      found: false,
      statusCode: '404',
      statusMessage: typeof data.status_message === 'string' ? data.status_message : 'Not found',
      transactionId: null,
      orderId: providerOrderId,
      merchantId: null,
      grossAmountRaw: null,
      grossAmountInt: null,
      currency: 'IDR',
      paymentType: null,
      transactionStatus: 'not_found',
      fraudStatus: null,
      acquirer: null,
      transactionTime: null,
      settlementTime: null,
      expiryTime: null,
      disposition: 'PENDING',
    };
  }

  if (!response.ok || !['200', '201', '407'].includes(statusCode)) {
    throw Object.assign(
      new Error(
        `Gagal membaca status transaksi Midtrans (${typeof data.status_message === 'string' ? data.status_message : statusCode}).`,
      ),
      { status: 502, code: 'PROVIDER_STATUS_ERROR' },
    );
  }

  const transactionStatus = String(data.transaction_status || 'pending').toLowerCase();
  const fraudStatus = typeof data.fraud_status === 'string' ? data.fraud_status : null;

  return {
    found: true,
    statusCode,
    statusMessage: typeof data.status_message === 'string' ? data.status_message : '',
    transactionId: typeof data.transaction_id === 'string' ? data.transaction_id : null,
    orderId: typeof data.order_id === 'string' ? data.order_id : null,
    merchantId: typeof data.merchant_id === 'string' ? data.merchant_id : null,
    grossAmountRaw: data.gross_amount !== undefined ? String(data.gross_amount) : null,
    grossAmountInt: parseStrictGrossAmount(data.gross_amount),
    currency: typeof data.currency === 'string' ? data.currency : 'IDR',
    paymentType: typeof data.payment_type === 'string' ? data.payment_type.toLowerCase() : null,
    transactionStatus,
    fraudStatus,
    acquirer: typeof data.acquirer === 'string' ? data.acquirer : null,
    transactionTime: parseMidtransTimestamp(data.transaction_time),
    settlementTime: parseMidtransTimestamp(data.settlement_time),
    expiryTime: parseMidtransTimestamp(data.expiry_time),
    disposition: mapMidtransTransactionState(transactionStatus, fraudStatus),
  };
}
