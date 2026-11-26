# Security, Financial & Application Audit — 26 November 2026

## Executive Summary

WarkopOS has been audited end-to-end across public SaaS, customer QR ordering, POS cashier, merchant administration, Super Admin, PostgreSQL schema/migrations, and automated test infrastructure, and upgraded to a production-ready multi-tenant MVP foundation.

---

## Key Issues Identified & Resolved

### 1. Critical Security & Multi-Tenant Isolation
- **Dead Legacy JSON Code & Startup Writes**: Removed ~640 lines of unreachable legacy `/api/pos/*` handlers and startup disk writes from `server.ts` while keeping `/api/pos/*` returning `410 Gone` and preserving `data/pos-state.json` untouched.
- **Tenant Context Enforcement (`500` → `403`)**: Added `requireMerchantContext` middleware across all `/api/v1/*` routers and `/api/v1/events` SSE so non-merchant sessions (e.g., `SUPER_ADMIN` with empty `merchantId`) are cleanly rejected with `403` instead of reaching PostgreSQL UUID queries.
- **Standalone Route Protection**: Added `/api/auth/me` session and role verification to standalone `/admin/kitchen` and `/admin/tables/print` routes so unauthenticated visitors redirect immediately to `/merchant/login`.
- **CSRF & XSS Hardening**: Added `verifySameOriginMutation` middleware (`Sec-Fetch-Site` + `Origin`) for cookie-authenticated mutations, validated product/logo/QRIS image URLs and QR Base URLs (`isSafeImageOrUrl`, `isSafeBaseUrl`) to block `javascript:` / `data:text/html` payloads, and validated UUID path parameters (`404` instead of PG `22P02`).

### 2. Order & Financial Integrity (`Pay First, Order Later`)
- **Database-Level Pay-First Constraint**: Added migration `0013_integrity_constraints.sql` (`orders_paid_queue_check`) ensuring `NEW_ORDER` and `IN_PROGRESS` rows can never exist without `payment_status = 'PAID'`.
- **Unpaid Dashboard Action Bug**: Fixed `AdminDashboardPage.tsx` where `AWAITING_PAYMENT` orders previously rendered a `[Mulai Masak]` button; unpaid orders now display `Menunggu Verifikasi` and route staff to payment verification.
- **Variant & Category Validation**: Enforced max 1 selected option per variant group (`duplicateGroup` check), active category verification on checkout and public QR menus, cash upper-bound validation, and preserved `change` on idempotent POS cash replays.

### 3. SaaS Subscriptions, Reporting & Legacy Migration
- **Effective Subscription Expiry**: Updated Super Admin overview KPIs and merchant list to compute effective `EXPIRED` status when `TRIAL` or `ACTIVE` timestamps have elapsed, matching runtime entitlement checks.
- **WIB (`Asia/Jakarta`) Timezone & Paginated Reporting**: Aligned dashboard "Today" metrics, history date filters, and server-side CSV exports (`/api/v1/orders/history/export.csv`, `/api/v1/payments/export.csv`) to `Asia/Jakarta` (`UTC+07:00`), added server pagination (eliminating silent 200-row truncation), and added CSV formula-injection neutralization (`sanitizeCsvCell`).
- **Isolated Demo & Reconciled Legacy Importer**: Rebuilt `/demo` as a zero-DB in-memory sandbox so demo usage never mixes with real merchant records, and upgraded `migrate-legacy-json.ts` with `--dry-run` rollback, historical paid order import, explicit unsupported-record reporting, and financial reconciliation.

### 4. Performance, UI/UX & Test Determinism
- **Bundle & N+1 Optimization**: Lazy-loaded `LandingPage` (reducing initial `index.js` entry chunk from `56.44 kB` to `26.17 kB`, `6.21 kB` gzip) and added `?includeCustomizations=1` batching on `GET /api/v1/products` (eliminating `1 + N` requests on `AdminMenuPage`).
- **Deterministic Test Suites**: Added 9 Vitest unit + PostgreSQL integration tests (`laris_pos_vitest_e2e`) and expanded Playwright E2E with full registration-to-first-order onboarding, seeding all 3 plans and restoring `merchantA` state in `finally` blocks.
