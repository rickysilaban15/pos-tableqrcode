import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.ts';

export type SessionClaims = {
  sub: string;
  merchantId: string;
  outletId: string;
  role: 'SUPER_ADMIN' | 'MERCHANT_OWNER' | 'CASHIER';
};

declare global {
  namespace Express {
    interface Request {
      auth?: SessionClaims;
    }
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.laris_session || req.header('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token || !env.JWT_SECRET) {
    return res.status(401).json({ error: 'Sesi tidak valid atau telah berakhir' });
  }
  try {
    const claims = jwt.verify(token, env.JWT_SECRET) as SessionClaims;
    if (!claims || !isUuid(claims.sub)) {
      return res.status(401).json({ error: 'Sesi tidak valid atau telah berakhir' });
    }
    req.auth = claims;
    return next();
  } catch {
    return res.status(401).json({ error: 'Sesi tidak valid atau telah berakhir' });
  }
}

export function allowRoles(...roles: SessionClaims['role'][]) {
  return (req: Request, res: Response, next: NextFunction) =>
    !req.auth || !roles.includes(req.auth.role)
      ? res.status(403).json({ error: 'Anda tidak memiliki akses untuk tindakan ini' })
      : next();
}

/**
 * Enforces authenticated tenant context (MERCHANT_OWNER or CASHIER) with valid
 * UUID merchantId and outletId so non-merchant roles (e.g. SUPER_ADMIN) never
 * leak into tenant queries or trigger UUID syntax errors.
 */
export function requireMerchantContext(req: Request, res: Response, next: NextFunction) {
  if (!req.auth) {
    return res.status(401).json({ error: 'Sesi tidak valid atau telah berakhir' });
  }
  if (req.auth.role !== 'MERCHANT_OWNER' && req.auth.role !== 'CASHIER') {
    return res.status(403).json({ error: 'Halaman atau layanan ini khusus untuk akun merchant' });
  }
  if (!isUuid(req.auth.merchantId) || !isUuid(req.auth.outletId)) {
    return res.status(403).json({ error: ' Konteks merchant atau outlet tidak valid'.trim() });
  }
  return next();
}
