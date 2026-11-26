# Implementation Plan & Completion Status

## Architectural Priorities

1. **Multi-Tenant Foundation & Security** — PostgreSQL 16 + Drizzle ORM, versioned transactional migrations (`0000`–`0013`), server-bound `merchant_id` / `outlet_id` context (`requireMerchantContext`), RBAC (`SUPER_ADMIN`, `MERCHANT_OWNER`, `CASHIER`), same-origin CSRF protection, URL/XSS sanitization, and `audit_logs`.
2. **Order & Financial Integrity (`Pay First, Order Later`)** — Server-authoritative catalog pricing, required variant group & active category validation, immutable snapshots, unique `(merchant_id, idempotency_key)` protection, `SELECT ... FOR UPDATE` row-locked payment confirmation (`CASH` & static `QRIS`), and PostgreSQL constraint `orders_paid_queue_check` enforcing `AWAITING_PAYMENT → NEW_ORDER → IN_PROGRESS → READY_TO_SERVE`.
3. **SaaS Subscriptions & Super Admin** — Dynamic DB-configured plans (`basic`, `pro`, `business`), `TRIAL` / `ACTIVE` / `EXPIRED` / `SUSPENDED` / `CANCELLED` lifecycle, effective expiry resolution, independent `qr_ordering_enabled` and `pos_enabled` entitlements, and continued processing of already-paid orders after expiry.
4. **Reporting, Realtime & Legacy Migration** — `Asia/Jakarta` (`WIB`) date boundaries, server-paginated order & payment history, full formula-safe CSV exports, tenant/tracking-scoped SSE streams with reconnect resync, isolated in-memory `/demo` sandbox, and dry-run reconciled legacy JSON migration.
5. **Commercial UI/UX & Performance** — Preserved LARIS Coffee aesthetic (`#1B4D3E`, `#FAF9F6`, `#FCD804`, `#252525`, `Plus Jakarta Sans`), 3D-layered WarkopOS SaaS landing page, mobile-first QR ordering & digital receipts, fast POS cashier, route-level code splitting (`26.17 kB` initial app chunk), and batched product customizations API.

---

## Completed Checklist

- [x] Complete application audit and multi-viewport baseline visual capture (`390×844`, `768×1024`, `1440×900`).
- [x] Dead unreachable `/api/pos/*` code & startup JSON writes removed from `server.ts`; `/api/pos/*` returns `410 Gone`; `data/pos-state.json` preserved untouched.
- [x] Drizzle `server/database/schema.ts` synchronized with all migrations `0000`–`0013` including `orders_paid_queue_check` and history indexes.
- [x] `requireMerchantContext` + UUID parameter guards + same-origin CSRF guard + URL/data-image XSS validation + CSV formula sanitization enforced across backend modules.
- [x] Standalone `/admin/kitchen` and `/admin/tables/print` routes protected with live merchant session checks.
- [x] Customer QR ordering, tracking, persistent order banner, `tableQrToken` back-navigation, and verified digital receipt modal completed.
- [x] Merchant onboarding 5-step persisted progress checklist (`profileConfigured`, `hasCategory`, `hasProduct`, `hasTableWithQr`, `hasPaidOrder`) wired end-to-end.
- [x] Merchant Dashboard unpaid-order action bug fixed (`Menunggu Verifikasi` badge + `Verifikasi Bayar` link instead of `Mulai Masak`), POS quick-cash & cart customization summaries added, Menu `1 + N` fetch eliminated via `?includeCustomizations=1`, and History WIB date presets + pagination + full CSV export verified.
- [x] Public SaaS `LandingPage` upgraded with 3D-layered product showcase, live `/api/public/plans` pricing, zero fabricated metrics, and isolated browser-memory `/demo` sandbox.
- [x] Deterministic Vitest unit & PostgreSQL integration suite (`9/9` tests on `laris_pos_vitest_e2e`) and Playwright E2E suite (`11` passing browser specs across mobile, tablet, and desktop including full zero-to-first-order onboarding) verified across consecutive runs.
- [x] Production deployment runbook (`DEPLOYMENT.md`), `ARCHITECTURE.md`, `DATABASE.md`, `AUDIT.md`, and `NEXT_STEPS.md` updated.
