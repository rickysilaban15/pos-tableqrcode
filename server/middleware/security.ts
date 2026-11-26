import type { NextFunction, Request, Response } from 'express';

export function isSafeImageOrUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  const lower = trimmed.toLowerCase();
  return (
    lower.startsWith('https://') ||
    lower.startsWith('http://') ||
    lower.startsWith('/') ||
    lower.startsWith('data:image/')
  );
}

export function isSafeBaseUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (/^(javascript|data|vbscript):/i.test(trimmed)) return false;
  try {
    const parsed = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Neutralizes spreadsheet formula execution (=, +, -, @, tab, CR) when CSV files
 * are opened in Excel, LibreOffice Calc, or Google Sheets.
 */
export function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  if (typeof value === 'number' || typeof value === 'boolean') {
    return `"${String(value)}"`;
  }
  let text = String(value);
  if (/^[\s]*[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function extractRequestHost(req: Request): string {
  const forwarded = req.headers['x-forwarded-host'];
  const raw = (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0]) || req.headers.host || '';
  return raw.trim().toLowerCase();
}

/**
 * Defense-in-depth CSRF guard for cookie-authenticated state-changing endpoints.
 * Rejects cross-site browser mutations via Fetch Metadata (`Sec-Fetch-Site`) and `Origin` host matching.
 */
export function verifySameOriginMutation(req: Request, res: Response, next: NextFunction) {
  if (!MUTATION_METHODS.has(req.method.toUpperCase())) {
    return next();
  }
  // Only enforce CSRF origin checks when session cookie is present (Bearer API clients are immune to CSRF).
  if (!req.cookies?.laris_session) {
    return next();
  }

  const secFetchSite = req.headers['sec-fetch-site'];
  if (typeof secFetchSite === 'string' && secFetchSite.toLowerCase() === 'cross-site') {
    return res.status(403).json({ error: 'Permintaan lintas situs ditolak demi keamanan sesi.' });
  }

  const origin = req.headers.origin;
  if (typeof origin === 'string' && origin.trim() !== '') {
    try {
      const originHost = new URL(origin).host.toLowerCase();
      const requestHost = extractRequestHost(req);
      if (requestHost && originHost !== requestHost) {
        return res.status(403).json({ error: 'Origin permintaan tidak sesuai dengan host aplikasi.' });
      }
    } catch {
      return res.status(403).json({ error: 'Header Origin tidak valid.' });
    }
  }

  return next();
}
