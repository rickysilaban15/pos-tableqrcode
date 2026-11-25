import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.ts';

export type SessionClaims = { sub: string; merchantId: string; outletId: string; role: 'SUPER_ADMIN' | 'MERCHANT_OWNER' | 'CASHIER' };
declare global { namespace Express { interface Request { auth?: SessionClaims } } }

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.laris_session || req.header('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token || !env.JWT_SECRET) return res.status(401).json({ error: 'Sesi tidak valid atau telah berakhir' });
  try { req.auth = jwt.verify(token, env.JWT_SECRET) as SessionClaims; return next(); }
  catch { return res.status(401).json({ error: 'Sesi tidak valid atau telah berakhir' }); }
}

export function allowRoles(...roles: SessionClaims['role'][]) { return (req: Request, res: Response, next: NextFunction) => !req.auth || !roles.includes(req.auth.role) ? res.status(403).json({ error: 'Anda tidak memiliki akses untuk tindakan ini' }) : next(); }
