# WarkopOS Architecture

## 1. Platform Overview

WarkopOS is a multi-tenant Indonesian F&B SaaS web application built as a clean **modular monolith** (`React 19 + TypeScript + Vite + Tailwind CSS v4` frontend served alongside a `Node.js + Express + PostgreSQL 16 + Drizzle` backend).

- **Platform Identity**: **WarkopOS** (`/`, `/merchant/login`, `/super-admin/*`).
- **Tenant / Storefront Identity**: Individual merchants such as **LARIS Coffee** operate isolated catalogs, branding, logos, static QRIS images, table QR codes, POS registers, and transaction histories (`/q/:token`, `/tracking/:token`, `/admin/*`).
- **Demo Sandbox**: `/demo` runs an interactive, in-memory browser simulation of LARIS Coffee so prospective merchants can test Customer QR → Cashier Verification → Barista Queue without touching PostgreSQL.

---

## 2. Bounded Surfaces & Access Model

| Surface | Routes | Auth & Scoping |
| --- | --- | --- |
| Public SaaS & Demo | `/`, `/demo`, `GET /api/public/plans`, `POST /api/auth/register` | Public; rate-limited registration creates isolated `merchant`, `outlet`, `TRIAL` subscription, and `MERCHANT_OWNER` membership in one transaction. |
| Customer QR Ordering | `/q/:token`, `/order/:storeSlug`, `GET /api/public/qr/:token`, `POST /api/public/qr/:token/orders` | Scoped to active, SHA-256 hashed table QR token (`table_qr_codes`) + active outlet + active `qrOrderingEnabled` entitlement. |
| Customer Tracking & Receipt | `/tracking/:token`, `GET /api/public/tracking/:token`, `GET /api/public/orders/:token/events` | Scoped strictly to opaque 256-bit `tracking_token` (`SHA-256` stored in `orders.tracking_token_hash`). |
| Merchant Operations | `/admin/*`, `/admin/kitchen`, `/admin/tables/print`, `/api/v1/*` | `HttpOnly` JWT cookie (`laris_session`) + `requireMerchantContext` binding `merchantId` and `outletId` server-side + RBAC (`MERCHANT_OWNER`, `CASHIER`). |
| Platform Super Admin | `/super-admin/*`, `/api/super-admin/*` | `HttpOnly` JWT cookie + live database check (`users.is_super_admin = true AND is_active = true`) on every request. |

---

## 3. Backend Module Structure

```text
server.ts                          Express app factory (createApp), security headers, CSRF guard, health, static SPA
server/
  config/env.ts                    Zod-validated runtime configuration
  database/
    client.ts                      PostgreSQL connection pool & Drizzle client
    schema.ts                      Authoritative Drizzle table definitions (synced with 0000–0013)
    migrations/0000..0013.sql      Versioned transactional SQL migrations
    migrate.ts / seed.ts           Transactional migration runner & idempotent plan seeder
  middleware/
    auth.ts                        JWT cookie verification, UUID check, requireMerchantContext, allowRoles
    security.ts                    Same-origin CSRF guard, safe URL/data-image validator, CSV formula sanitizer
    rateLimit.ts                   Endpoint-specific rate limiters
    errorHandler.ts                Structured Zod, domain, and HTTP error responses
  modules/
    auth/routes.ts                 Register, login, logout, /me, public plans
    categories/routes.ts           Tenant-scoped category CRUD
    products/routes.ts             Tenant-scoped product + batched customizations CRUD
    products/customizations.ts     Per-product variants & addons endpoints
    tables/routes.ts               Table CRUD, QR rotation, public QR menu, legacy QR lookup
    settings/routes.ts             Outlet profile, availability, service modes, static QRIS, QR base URL
    orders/service.ts              Transactional checkout, server pricing, snapshots, idempotency, entitlements
    orders/routes.ts               Public QR checkout/tracking, manual POS, active queue, WIB dashboard, paginated history & CSV
    payments/routes.ts             Cash & static QRIS confirmation, paginated payment history & CSV
    realtime/sse.ts                Tenant-scoped merchant SSE & tracking-token-scoped customer SSE
    superadmin/routes.ts           Super Admin auth, platform KPIs, merchant subscription editor, plan editor, audit log
  scripts/
    create-super-admin.ts          CLI Super Admin provisioning
    migrate-legacy-json.ts         Dry-run capable, reconciled, idempotent LARIS JSON importer
    e2e-prepare.ts                 Isolated *_e2e database preparation
```

---

## 4. Inviolable Order & Payment Lifecycle (`Pay First, Order Later`)

1. **Creation (`AWAITING_PAYMENT`)**:
   - Customer QR orders (`CASH` or `QRIS`) and POS `QRIS` bills start at `order_status = 'AWAITING_PAYMENT'` and `payment_status = 'UNPAID' | 'PENDING_VERIFICATION'`.
   - Server recomputes every unit price, required variant group (max 1 option per group), active addon, and total in integer Rupiah (`IDR`), storing immutable snapshots in `order_items` and `order_item_addons`.
   - Unpaid orders **never** enter the barista/kitchen queue. Enforced both in service code and by PostgreSQL constraint `orders_paid_queue_check`.
2. **Payment Verification (`NEW_ORDER` + `PAID`)**:
   - POS `CASH` orders verify immediately inside the creation transaction (`cash_received >= total_amount`, recording exact `change_amount`).
   - Pending `CASH` and static `QRIS` orders are verified by authenticated staff via `POST /api/v1/payments/:orderId/confirm` using `SELECT ... FOR UPDATE` row locking, transitioning atomically to `payment_status = 'PAID'` and `order_status = 'NEW_ORDER'`.
3. **Preparation & Ready (`IN_PROGRESS → READY_TO_SERVE`)**:
   - Barista/cashier advances `NEW_ORDER → IN_PROGRESS → READY_TO_SERVE`.
   - `READY_TO_SERVE` is the terminal operational state (`completed_at` recorded). No extra `COMPLETED` state exists.
   - Unpaid orders may be cancelled (`CANCELLED`); already-paid orders cancelled by staff transition to `CANCELLED` + `payment_status = 'REFUNDED'` with an immutable `audit_logs` entry.
