# Implementation Plan

## Urutan implementasi

1. **Fondasi data dan keamanan** — PostgreSQL/Supabase, migrasi, tenant context wajib, auth merchant/super-admin, RBAC/feature entitlement, audit log dan secret management.
2. **Ordering dan POS yang dapat dipercaya** — endpoint publik terbatas, idempotency key, status payment dari provider/webhook, status order tervalidasi, POS manual, cetak struk dan histori.
3. **Subscription dan super admin** — package/feature entitlement dinamis, trial configurable, billing events, merchant lifecycle dan audit log.
4. **Inventory dan finance** — bahan baku, recipe, stock movement, opname, HPP/COGS, biaya, laba-rugi dan ekspor.
5. **Mobile** — Expo/React Native setelah API auth dan POS stabil.

## Definition of done untuk fase 1

- Semua record memiliki `tenant_id` dan query selalu mendapat tenant context server-side.
- Tidak ada harga, entitlement, status pembayaran, atau identitas merchant yang dipercaya dari browser.
- Order create/idempotency/payment/status berjalan dalam transaksi dan diaudit.
- Reset/seed hanya ada dalam tooling development, tidak dalam server production.
- Unit, integration, authorization-isolation, build dan smoke test berjalan CI.

## Phase 1B implementation checklist

### Permanent merchant migration rule

- [x] Before changing an existing merchant page, inspect its original source and visual structure; preserve its layout, components, filters, search, dialogs, charts, interactions, assets, and useful features. Replace only legacy data/business handlers with PostgreSQL-backed equivalents, compare before/after browser screenshots, and run functional plus visual regression before removing any legacy operational path. Rich pages must never be replaced with temporary generic interfaces, and duplicate pages are prohibited. This does not prohibit a genuinely missing, approved core feature: it may be added once as the canonical implementation inside the established authenticated shell and design system.

### Consolidation direction (in progress)

- [x] Recovery snapshot created locally before consolidation; original LARIS customer/admin components and assets retained.
- [x] Customer consolidation: `/q/:token` and `/tracking/:token` use the original LARIS menu, cart, checkout, and tracking components; redundant PostgreSQL customer pages have been removed after browser regression passed.
- [~] Merchant consolidation: `/merchant` is now a compatibility alias to the original authenticated `/admin` shell. The shell verifies the real JWT session; individual legacy admin data pages still require PostgreSQL migration before `PostgresMerchantPage` can be removed.
- [x] Original `AdminOrdersPage` restored and migrated to PostgreSQL payment verification and paid-only operational queue: original filter/search/card/detail interactions retained, with tenant-scoped API data and canonical `/admin/orders` browser flow verified.
- [x] Original `AdminDashboardPage` migrated to tenant-scoped PostgreSQL dashboard data: existing KPI strip, responsive recent-order views, activity summary, QR shortcut, and quick status actions retained and browser-verified.
- [x] Original `AdminCategoriesPage` migrated to authenticated PostgreSQL category/product APIs: original add, inline edit, active toggle, delete confirmation, product counts, and table layout retained and browser-verified.
- [x] Original `AdminMenuPage` migrated to PostgreSQL product/customization APIs: original search, category filter, image gallery, product dialog, availability controls, archival confirmation, variant groups, required options, and addons retained. Product and customization create/edit writes are transactional and browser-verified through QR checkout.
- [x] Original `AdminTablesPage` and `AdminTablePrintPage` migrated to PostgreSQL tables/QR APIs: original cards, edit/preview dialogs, download, print layout, and branded QR cards retained. Newly issued QR tokens are persisted; legacy hash-only QR scans remain valid but are honestly non-reprintable until merchant regenerates. Browser regression verifies create, public menu context, regeneration, and revoked-token rejection.
- [ ] Safe idempotent migration of legacy LARIS JSON operational data and legacy QR compatibility mapping.

- [x] Variants/addons persistence, server-side checkout pricing, validation, and order snapshots
- [x] Pay-first lifecycle and merchant queue: payment activation plus NEW_ORDER → IN_PROGRESS → READY_TO_SERVE implemented and browser-verified
- [x] Merchant order lifecycle and customer tracking: resource-scoped tracking token, paid-only queue, and terminal READY_TO_SERVE verified
- [x] Payments: cash confirmation and static QRIS manual verification backend implemented; cash browser flow verified
- [x] Manual POS: canonical `/admin/pos` uses the shared PostgreSQL checkout writer with explicit required variants/addons, order and fulfillment selection, conditional table selection, cash change, QRIS pending verification, retry-safe idempotency, receipt print action, and isolated-browser cash regression coverage.
- [~] Merchant data interfaces: pending payments, active queue, ready history, and receipt API. Orders/pending responses now include table, fulfillment, payment and timing context required by the original Orders UI.
- [~] Secure customer tracking API with resource-scoped token
- [x] Tenant-scoped business settings: `outlet_settings` migration, authenticated LARIS settings page, public menu settings projection, availability/service enforcement, and configured static QRIS passed isolated PostgreSQL browser coverage.
- [x] Tenant/resource-scoped SSE: authenticated merchant stream and resource-scoped customer tracking stream are available after committed order/payment changes.
- [x] Subscription entitlement enforcement: QR Ordering and POS are independently enforced server-side; paid operational orders remain processable.
- [ ] Frontend authenticated PostgreSQL migration
- [x] Legacy JSON production shutdown: `/api/pos` now returns `410`; root app no longer mounts its legacy provider.
- [~] Isolated PostgreSQL integration and browser E2E tests: dedicated `*_e2e` database guard, Chromium Playwright setup, and responsive customer-to-merchant workflow added; broader API concurrency coverage remains

### E2E verification (latest)

- `npm run test:e2e`: 6 passed, 6 intentional cross-viewport skips. The passing workflows cover customer-to-merchant cash flow, static QRIS configuration/verification, outlet availability and service policy enforcement, tenant isolation, manual POS, and API access boundaries against the isolated PostgreSQL database.
- The harness refuses any `TEST_DATABASE_URL` whose database name does not end in `_e2e`, creates it only when absent, and truncates only that database between runs. It never resets the development database.
- A successful customer tracking screenshot is generated at `test-results/customer-ready.png` (ignored test artifact).
