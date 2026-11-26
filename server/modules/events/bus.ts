import type { Response } from 'express';

export type OrderEventType =
  | 'order:created'
  | 'payment:confirmed'
  | 'order:updated'
  | 'order:cancelled'
  | 'order:refunded'
  | 'order:expired'
  | 'settings:updated';

export type TenantEvent = {
  id: string;
  type: OrderEventType;
  merchantId: string;
  outletId: string;
  orderId?: string;
  orderStatus?: string;
  paymentStatus?: string;
  updatedAt: string;
};

export type TrackingEvent = {
  id: string;
  type: OrderEventType;
  orderId: string;
  orderStatus: string;
  paymentStatus: string;
  updatedAt: string;
};

const tenantClients = new Map<string, Set<Response>>();
const trackingClients = new Map<string, Set<Response>>();
let seq = 0;

function nextId(): string {
  seq += 1;
  return `${Date.now()}-${seq}`;
}

function tenantKey(merchantId: string, outletId: string): string {
  return `${merchantId}:${outletId}`;
}

function writeSse(res: Response, id: string, eventName: string, payload: unknown): boolean {
  try {
    res.write(`id: ${id}\nevent: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`);
    return true;
  } catch {
    return false;
  }
}

export function subscribeTenantEvents(merchantId: string, outletId: string, res: Response): () => void {
  const key = tenantKey(merchantId, outletId);
  let bucket = tenantClients.get(key);
  if (!bucket) {
    bucket = new Set();
    tenantClients.set(key, bucket);
  }
  bucket.add(res);
  writeSse(res, nextId(), 'connected', { ok: true, updatedAt: new Date().toISOString() });

  const keepAlive = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch {
      clearInterval(keepAlive);
      bucket?.delete(res);
    }
  }, 20_000);

  return () => {
    clearInterval(keepAlive);
    bucket?.delete(res);
    if (bucket && bucket.size === 0) tenantClients.delete(key);
  };
}

export function subscribeTrackingEvents(trackingTokenHash: string, res: Response): () => void {
  let bucket = trackingClients.get(trackingTokenHash);
  if (!bucket) {
    bucket = new Set();
    trackingClients.set(trackingTokenHash, bucket);
  }
  bucket.add(res);
  writeSse(res, nextId(), 'connected', { ok: true, updatedAt: new Date().toISOString() });

  const keepAlive = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch {
      clearInterval(keepAlive);
      bucket?.delete(res);
    }
  }, 20_000);

  return () => {
    clearInterval(keepAlive);
    bucket?.delete(res);
    if (bucket && bucket.size === 0) trackingClients.delete(trackingTokenHash);
  };
}

/** Publish only after the PostgreSQL transaction commits. */
export function publishTenantEvent(event: Omit<TenantEvent, 'id' | 'updatedAt'>): void {
  const bucket = tenantClients.get(tenantKey(event.merchantId, event.outletId));
  if (!bucket || bucket.size === 0) return;
  const id = nextId();
  const full: TenantEvent = { ...event, id, updatedAt: new Date().toISOString() };
  for (const res of bucket) {
    if (!writeSse(res, id, event.type, full)) {
      bucket.delete(res);
    }
  }
}

/** Publish order update exclusively to subscribers holding that order's tracking token hash. */
export function publishTrackingEvent(
  trackingTokenHash: string | null | undefined,
  event: Omit<TrackingEvent, 'id' | 'updatedAt'>,
): void {
  if (!trackingTokenHash) return;
  const bucket = trackingClients.get(trackingTokenHash);
  if (!bucket || bucket.size === 0) return;
  const id = nextId();
  const full: TrackingEvent = { ...event, id, updatedAt: new Date().toISOString() };
  for (const res of bucket) {
    if (!writeSse(res, id, event.type, full)) {
      bucket.delete(res);
    }
  }
}
