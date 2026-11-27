# Implementation Plan & Completion Status

## Architectural Priorities

1. **Multi-Tenant Foundation & Security** — PostgreSQL 16 + Drizzle ORM, versioned transactional migrations (`0000`–`0014`), server-bound `merchant_id` / `outlet_id` context (`requireMerchantContext`), RBAC (`SUPER_ADMIN`, `MERCHANT_OWNER`, `CASHIER`), same-origin CSRF protection, URL/XSS sanitization, and `audit_logs`.
2. **Order & Financial Integrity (`Pay First, Order Later`)** — Server-authoritative catalog pricing, required variant group & active category validation, immutable snapshots, unique `(outlet_id, idempotency_key)` protection, `SELECT ... FOR UPDATE` row-locked payment confirmation (`CASH`, static `QRIS`, and Midtrans Sandbox `QRIS_DYNAMIC`), and extended PostgreSQL constraint `orders_paid_queue_check` enforcing `AWAITING_PAYMENT → NEW_ORDER → IN_PROGRESS → READY_TO_SERVE` (allowing post-service `REFUNDED` on `READY_TO_SERVE`).
3. **Real Payment Gateway Architecture (Phase 2 — Midtrans Core API v2 Sandbox)** — Non-BI-SNAP Core API v2 (`POST /v2/charge` + `GET /v2/{order_id}/status`), production kill-switch (`MIDTRANS_ENVIRONMENT=production` and `Mid-server-...` keys blocked), designated single-merchant Sandbox credential isolation (`MIDTRANS_SANDBOX_MERCHANT_ID`), constant-time SHA-512 webhook verification (`POST /api/webhooks/midtrans`) with `payment_webhook_events` deduplication & out-of-order defense, local rate-limited status reconciliation without public tunnels, and strict separation of `SANDBOX` simulation volume from `PRODUCTION` revenue/GMV KPIs.
4. **SaaS Subscriptions, Subscription Invoices & Super Admin** — Dynamic DB-configured plans (`basic`, `pro`, `business`), separate `subscription_invoices` (`WKP-SUB-*`) billing domain activating subscriptions ONLY upon verified Midtrans settlement, independent `qr_ordering_enabled` and `pos_enabled` entitlements, and continued processing of already-paid orders after expiry.
5. **Commercial UI/UX & Performance** — Preserved LARIS Coffee aesthetic (`#1B4D3E`, `#FAF9F6`, `#FCD804`, `#252525`, `Plus Jakarta Sans`), reusable `DynamicQrisCard` with authoritative countdown & Sandbox safety warnings across Customer Checkout, Customer Tracking, Merchant POS, and Subscription Invoices, plus route-level code splitting.

---

## Phase 1 Completed Checklist

- [x] Complete application audit and multi-viewport baseline visual capture (`390×844`, `768×1024`, `1440×900`).
- [x] Dead unreachable `/api/pos/*` code & startup JSON writes removed from `server.ts`; `/api/pos/*` returns `410 Gone`; `data/pos-state.json` preserved untouched.
- [x] Drizzle `server/database/schema.ts` synchronized with migrations `0000`–`0013` including `orders_paid_queue_check` and history indexes.
- [x] `requireMerchantContext` + UUID parameter guards + same-origin CSRF guard + URL/data-image XSS validation + CSV formula sanitization enforced across backend modules.
- [x] Standalone `/admin/kitchen` and `/admin/tables/print` routes protected with live merchant session checks.
- [x] Customer QR ordering, tracking, persistent order banner, `tableQrToken` back-navigation, and verified digital receipt modal completed.
- [x] Merchant onboarding 5-step persisted progress checklist (`profileConfigured`, `hasCategory`, `hasProduct`, `hasTableWithQr`, `hasPaidOrder`) wired end-to-end.
- [x] Merchant Dashboard unpaid-order action bug fixed, POS quick-cash & cart customization summaries added, Menu `1 + N` fetch eliminated via `?includeCustomizations=1`, and History WIB date presets + pagination + full CSV export verified.
- [x] Public SaaS `LandingPage` upgraded with 3D-layered product showcase, live `/api/public/plans` pricing, zero fabricated metrics, and isolated browser-memory `/demo` sandbox.

---

## Phase 2 Completed Checklist (Midtrans Sandbox Dynamic QRIS & Financial Integrity)

- [x] Official Midtrans Core API v2 Sandbox client (`server/modules/payments/midtrans.ts`) with Basic Auth, `POST /v2/charge` (`payment_type: "qris"`), `GET /v2/{order_id}/status`, WIB GMT+7 timestamp parsing, and production mode/key blocking (`server/config/env.ts`).
- [x] Additive migration `0014_payment_gateway_and_invoices.sql` & Drizzle `schema.ts` updates: `outlet_settings.enable_dynamic_qris`, `payments` provider/QR/reconciliation columns & partial unique indexes, `payment_webhook_events`, `subscription_invoices`, and extended `orders_paid_queue_check` covering `READY_TO_SERVE`.
- [x] Authoritative payment reconciliation (`server/modules/payments/reconcile.ts`) outside open DB transactions with `FOR UPDATE` row locking, mismatch quarantine (`QUARANTINED_MISMATCH`), late-settlement recovery (`LATE_SETTLEMENT_RECOVERED`), post-cancel settlement flagging (`SETTLED_AFTER_CANCEL_REQUIRES_REFUND`), and post-commit SSE broadcast.
- [x] Signed HTTPS webhook processor (`POST /api/webhooks/midtrans`) with `timingSafeEqual` SHA-512 verification, `signature_key` redaction, replay deduplication, out-of-order defense, and Status API cross-verification.
- [x] Manual confirmation block (`409 Conflict`) on `QRIS_DYNAMIC` orders (`POST /api/v1/payments/:orderId/confirm`) and tenant-scoped `MIDTRANS_SANDBOX_MERCHANT_ID` eligibility isolation.
- [x] Customer QR & Merchant POS Dynamic QRIS UI (`DynamicQrisCard`, `CartCheckoutDrawer`, `OrderTrackingPage`, `AdminPosPage`, `AdminOrdersPage`, `ReceiptModal`, `AdminSettingsPage`) with Sandbox warning banners, countdown timers, simulator helpers, and `Cek Status Pembayaran`.
- [x] Sandbox vs Production financial reporting separation across `AdminDashboardPage`, `AdminHistoryPage`, CSV exports, and `SuperAdminOverviewPage`.
- [x] Separate SaaS `subscription_invoices` domain (`/api/v1/subscription/invoices` + `/admin/subscription` UI) activating plans strictly after verified Midtrans settlement.
- [x] Automated Vitest unit & PostgreSQL integration suite (`21/21` passing tests across 3 files) + mocked Playwright E2E browser suite & multi-viewport visual QA (`390×844`, `768×1024`, `1440×900`) + `PAYMENT_GATEWAY.md`.
