import { describe, expect, it } from 'vitest';
import { isSafeBaseUrl, isSafeImageOrUrl, sanitizeCsvCell } from '../middleware/security.ts';
import { isUuid } from '../middleware/auth.ts';

describe('Security primitives', () => {
  it('neutralizes CSV formula injection vectors while preserving normal text and numbers', () => {
    expect(sanitizeCsvCell('=CMD|\' /C calc\'!A0')).toBe('"\'=CMD|\' /C calc\'!A0"');
    expect(sanitizeCsvCell('+SUM(A1:A10)')).toBe('"\'+SUM(A1:A10)"');
    expect(sanitizeCsvCell('-10+20')).toBe('"\'-10+20"');
    expect(sanitizeCsvCell('@IMPORTXML("http://evil")')).toBe('"\'@IMPORTXML(""http://evil"")"');
    expect(sanitizeCsvCell('  =HYPERLINK("http://evil")')).toBe('"\'  =HYPERLINK(""http://evil"")"');
    expect(sanitizeCsvCell('\t=1+1')).toBe('"\'\t=1+1"');
    expect(sanitizeCsvCell('Budi "Kopi" Santoso')).toBe('"Budi ""Kopi"" Santoso"');
    expect(sanitizeCsvCell(27000)).toBe('"27000"');
    expect(sanitizeCsvCell(null)).toBe('""');
    expect(sanitizeCsvCell(undefined)).toBe('""');
  });

  it('validates image and base URLs against XSS schemes', () => {
    expect(isSafeImageOrUrl('')).toBe(true);
    expect(isSafeImageOrUrl('/src/assets/images/menu_espresso_1795579206194.jpg')).toBe(true);
    expect(isSafeImageOrUrl('https://cdn.example.com/logo.png')).toBe(true);
    expect(isSafeImageOrUrl('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
    expect(isSafeImageOrUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeImageOrUrl('data:text/html,<script>alert(1)</script>')).toBe(false);

    expect(isSafeBaseUrl('https://warkopos.id')).toBe(true);
    expect(isSafeBaseUrl('192.168.1.10:3000')).toBe(true);
    expect(isSafeBaseUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeBaseUrl('data:text/plain,abc')).toBe(false);
  });

  it('validates strict UUID strings', () => {
    expect(isUuid('de21024e-5cd8-4da2-907c-d771a2daf31b')).toBe(true);
    expect(isUuid('')).toBe(false);
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid("1' OR '1'='1")).toBe(false);
  });
});
