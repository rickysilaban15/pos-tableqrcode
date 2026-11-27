---
inclusion: always
---

# F&B SaaS Platform — Persistent Project Rules

## Product Identity
- Platform name: WarkopOS (tentative). Merchant brand: LARIS Coffee.
- Merchant branding is configurable per outlet (name, logo, colors).
- Target: cafes, coffee shops, restaurants, warkop, warmindo.

## Architecture
- Modular monolith: React + Vite + TypeScript frontend, Express.js + Drizzle ORM backend.
- PostgreSQL on port 5433 (Docker). Never touch port 5432.
- Single source of truth: PostgreSQL. Legacy JSON state (`/api/pos`) returns HTTP 410.
- Multi-tenant: every query must be scoped to merchantId + outletId from the JWT session.
- JWT session in `laris_session` httpOnly cookie.

## Business Logic — INVIOLABLE
- **PAY FIRST, ORDER LATER**: only verified PAID orders enter the operational queue.
- Order lifecycle: `AWAITING_PAYMENT → NEW_ORDER → IN_PROGRESS → READY_TO_SERVE`
- `READY_TO_SERVE` is the final operational status. No `COMPLETED` confirmation step.
- Payment statuses: `AWAITING_PAYMENT`, `PAID`, `CANCELLED`
- Do not simulate successful payments.
- Static QRIS requires actual merchant payment confirmation via `/api/v1/payments/:id/confirm`.
- Cash payments: merchant confirms exact amount, change is computed server-side.

## Shared Services (QR + POS must both use these)
- Product catalog, customization validation, server-authoritative pricing
- Order creation service, payment service, idempotency keys
- Historical snapshots, receipt service, PostgreSQL as state

## Subscription Entitlements
- Plans: basic (Rp50k), pro (Rp120k), business (Rp250k)
- Statuses: TRIAL, ACTIVE, EXPIRED, SUSPENDED, CANCELLED
- Paid orders already in queue remain processable after expiry.
- Super Admin manages plans and merchant subscriptions via `/api/super-admin`.
- No permanent free plan.

## Security
- Role-based: SUPER_ADMIN, MERCHANT_OWNER, CASHIER
- Super Admin routes: `requireAuth + allowRoles('SUPER_ADMIN')`
- Merchant routes: `requireAuth + allowRoles('MERCHANT_OWNER', 'CASHIER')`
- Public routes: rate-limited, server-authoritative pricing
- Never expose stack traces, credentials, or env details in API responses.
- Audit log: all Super Admin actions recorded in `audit_logs` table.

## Design System
- Colors: Forest Green #1B4D3E, Warm Cream #FAF9F6, Golden Yellow #FCD804, Charcoal #252525
- Super Admin dark theme: deep forest #0D2B22, #0F1D18 backgrounds
- Font: Plus Jakarta Sans (via CSS)
- Preserve all existing LARIS pages, components, photography, modals, drawers.
- PRESERVE → INTEGRATE → IMPROVE. Never replace working UI with simplified versions.

## Routing
- `/` — Public SaaS landing (DemoPortalPage currently, replace with LandingPage)
- `/admin/*` — Merchant dashboard (AdminLayout, requires MERCHANT_OWNER auth)
- `/merchant/login` — Merchant login
- `/super-admin/login` — Super Admin login
- `/super-admin/*` — Super Admin dashboard (SuperAdminLayout, requires SUPER_ADMIN role)
- `/order/:storeSlug` — Customer QR ordering (no auth)
- `/q/:token` — Customer QR ordering via table token
- `/tracking/:token` — Order tracking (no auth)

## Execution Rules
- SELECT UNFINISHED TASK → IMPLEMENT → TYPE-CHECK → BUILD → FIX → CONTINUE
- Do not stop after creating specs, stubs, or single endpoints.
- Record blockers in NEXT_STEPS.md. Continue independent tasks.
- No destructive git ops. Never overwrite .env. Never delete Docker volumes.
