# Roadmap

## Phase 0 — Foundation (current)

- [x] Preserve existing React/Vite/TypeScript/Tailwind/Express base.
- [x] Audit current prototype and remove unused AI dependency/configuration.
- [x] Harden order price, product option and table-token verification.
- [x] Disable production demo reset and remove fake offline order success.
- [ ] PostgreSQL schema, migrations and tenant-scoped repositories.
- [ ] Authentication, RBAC, feature entitlement and audit log.

## Phase 1 — Core ordering and POS

- [ ] Customer QR menu, search, variants, cart, checkout and tracking against public tenant API.
- [ ] Merchant login, incoming orders, manual POS, menu/category/table/QR management, payment, receipts and sales history.
- [ ] Verified payment integration, idempotency and authorized order transitions.

## Phase 2 — SaaS operations

- [ ] Super admin: merchant, plans, entitlements, trial, billing, health and audit dashboard.
- [ ] Configurable Basic/Pro/Business packages and independent ordering/POS modules.

## Phase 3 — Operations and finance

- [ ] Inventory, recipe, stock deduction/opname, HPP/COGS, expense and P&L.

## Phase 4 — Native mobile

- [ ] React Native + Expo merchant POS client using the same secured API; Android first, iOS-ready structure.
