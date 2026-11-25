# Repository Audit — 25 November 2026

## Ringkasan

LARIS POS adalah prototype QR ordering satu-merchant, bukan SaaS multi-tenant yang siap produksi. UI customer dan merchant sudah ada serta dapat menjadi fondasi yang baik, tetapi backend berada pada satu `server.ts`, memakai state JSON global, dan tidak memiliki autentikasi maupun otorisasi.

## Inventaris saat ini

| Area | Temuan |
| --- | --- |
| Stack | React 19, Vite 8, TypeScript, Tailwind 4, Express 4, QRCode, SSE. |
| Frontend | Portal demo, customer menu/checkout/tracking, merchant dashboard, order, menu, kategori, meja, pengaturan dan cetak QR. |
| Backend | Express dalam `server.ts`; CRUD settings, kategori, produk, meja, order, status, pembayaran, SSE dan reset demo. |
| Penyimpanan | Runtime menulis `data/pos-state.json`; seed berada di `src/data/seedData.ts`. Tidak ada database/migrasi. |
| Auth/RBAC | Tidak ada. Semua endpoint merchant dapat dipanggil publik. |
| Data contoh | Seluruh kafe, menu, meja dan pesanan di `seedData.ts`; jelas merupakan demo. |

## Pengujian perilaku yang perlu ditangani

- State API mengirim keseluruhan data, termasuk token meja, kepada klien tanpa pemisahan endpoint publik dan merchant.
- Sebelum perbaikan ini, server menghitung total dari harga, topping dan status pembayaran yang dikirim browser. Sekarang order direkonstruksi dari katalog server dan selalu berstatus `BELUM_DIBAYAR` saat dibuat.
- Sebelum perbaikan ini, QR meja hanya divalidasi di browser dan order menerima `tableId`/nama meja bebas. Sekarang server mengharuskan token meja yang cocok.
- Sebelum perbaikan ini, reset demo terbuka untuk semua environment. Sekarang hanya tersedia pada development ketika `ENABLE_DEMO_RESET=true`.
- Fallback offline sebelumnya menciptakan pesanan lokal yang terlihat sukses tetapi tidak pernah sampai ke merchant. Fallback tersebut telah dihapus.

## Risiko produksi tersisa (prioritas)

1. **Kritis:** belum ada authentication, role authorization, tenant isolation, atau database transaction. Jangan deploy sebagai sistem merchant nyata.
2. **Kritis:** payment confirmation dan perubahan status order belum dilindungi peran; harus dipindahkan ke endpoint authenticated pada fase backend modular.
3. **Tinggi:** persistence JSON satu proses tidak aman untuk multi-instance, restart, backup, atau audit. Migrasikan ke PostgreSQL/Supabase sebelum onboarding merchant.
4. **Tinggi:** rate limiter saat ini per-process dan memori; gunakan Redis/API gateway rate limit saat production.
5. **Sedang:** ID order berbasis sequence di memori dan token QR lama dari seed tidak cukup sebagai skema token berotasi/auditable.
6. **Sedang:** tidak ada automated test suite, observability, migration pipeline, CSRF/session strategy, idempotency key, atau webhook signature verification.

## Dependency dan konfigurasi

`@google/genai` dan konfigurasi Gemini tidak digunakan dan telah dihapus dari manifest/config contoh. `bun.lock` perlu diregenerasi dengan Bun pada mesin pengembang sebelum merge agar lockfile juga mencerminkan perubahan tersebut.

## Kesiapan produksi

**Belum siap produksi.** Phase 1 now includes a PostgreSQL migration, pooled Drizzle connection, JWT/httpOnly-cookie auth module and plan entitlement seed. Existing POS routes are still on the legacy JSON compatibility adapter until their tenant-scoped repositories are migrated; do not deploy it as a multi-tenant production system yet.

At the latest verification attempt Docker Desktop opened successfully, but its credential helper stalled while pulling `postgres:16-alpine`; no container, migration, or seed result is claimed until that external environment issue is resolved.
