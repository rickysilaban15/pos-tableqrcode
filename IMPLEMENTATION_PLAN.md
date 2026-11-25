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

- [x] Variants/addons persistence, server-side checkout pricing, validation, and order snapshots
- [~] Pay-first lifecycle and merchant queue: payment activation plus NEW_ORDER → IN_PROGRESS → READY_TO_SERVE implemented
- [ ] Merchant order lifecycle and customer tracking
- [~] Payments: cash confirmation and static QRIS manual verification backend implemented
- [~] Merchant data interfaces: pending payments, active queue, ready history, and receipt API
- [~] Secure customer tracking API with resource-scoped token
- [ ] Tenant-scoped business settings
- [ ] Tenant/resource-scoped SSE
- [ ] Subscription entitlement enforcement
- [ ] Frontend authenticated PostgreSQL migration
- [ ] Legacy JSON production shutdown
- [ ] Isolated PostgreSQL integration and browser E2E tests
