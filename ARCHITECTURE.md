# Target Architecture

## Bounded surfaces

`Customer web` memakai endpoint publik terbatas untuk menu, QR token dan create order. `Merchant web/mobile` dan `Super admin` memakai API yang sama tetapi membawa access token dan tenant context. UI tidak menentukan role atau feature access.

## Backend modules

```
src/server/
  config/       environment validation and secrets
  routes/       HTTP mapping only
  controllers/  request/response mapping
  services/     order, payment, subscription business rules
  repositories/ PostgreSQL queries, always tenant-scoped
  middleware/   auth, tenant, entitlement, rate-limit, errors
  validation/   request schemas
  shared/       domain types and errors
```

## Data ownership

- `merchants`, `users`, `memberships`, `roles`, `subscriptions`, `plans`, `features`, `entitlements`
- `categories`, `products`, `product_variants`, `tables`, `qr_tokens`
- `orders`, `order_items`, `payments`, `payment_events`, `idempotency_keys`, `audit_logs`

Every merchant-owned record includes `tenant_id`; repositories must bind it from verified authentication, never URL/body input. PostgreSQL row-level security is recommended as defence in depth.

## Order lifecycle

Customer request → token/table validation → server catalog pricing → transaction creates order/items/idempotency record → payment provider webhook verifies signature → payment state update → authorized merchant advances operational order state → SSE/WebSocket emits tenant-scoped event. `COMPLETED` requires fulfilment and payment conditions.

## Runtime rules

- Production requires database, validated environment, structured logs and a shared rate limiter.
- QR secrets are opaque, high-entropy, rotatable tokens; leaked/replaced tokens are revoked.
- Demo seeds/reset are development tooling only.
- `server/modules/auth` is the first extracted module; the remaining legacy POS API is intentionally retained during the staged migration rather than deleted.
