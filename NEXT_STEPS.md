# Phase 1B next steps

Current database-backed components: auth, products, categories, tables/QR, public basic orders with idempotency, and merchant variant/addon management.

Next implementation priority:

1. Extend `server/modules/orders/routes.ts` request items with `variantIds`/`addonIds`; derive prices and save `order_items.selections` inside the existing transaction.
2. Add merchant tenant-scoped order list/detail/status transitions; require paid payment before `COMPLETED`.
3. Add payment transaction service and protected cash/QRIS verification endpoints.
4. Add test database harness before destructive integration coverage.

Known technical debt: legacy `server.ts` JSON routes remain active and must be disabled in production only after the frontend migrates to `/api/v1` and `/api/public`.
