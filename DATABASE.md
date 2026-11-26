# Database Guide & Schema Reference

WarkopOS uses **PostgreSQL 16** as its sole operational source of truth, paired with **Drizzle ORM** (`server/database/schema.ts`) and versioned SQL migrations (`server/database/migrations/0000_*.sql` – `0013_*.sql`).

---

## 1. Local PostgreSQL Setup (Port 5433 Isolation)

Host port `5433` is used exclusively so any unrelated PostgreSQL service on `5432` is never touched:

```bash
# 1. Start isolated PostgreSQL 16 container on 127.0.0.1:5433
docker compose up -d

# 2. Apply all versioned SQL migrations (0000 through 0013)
npm run db:migrate

# 3. Seed canonical SaaS plans (Basic, Pro, Business) idempotently
npm run db:seed
```

### Automated Test Databases
- **Vitest Integration Suite**: Uses `laris_pos_vitest_e2e` on port `5433`.
- **Playwright E2E Suite**: Uses `laris_pos_e2e` on port `5433`.
- Both test harnesses refuse to run `TRUNCATE` unless the target database name ends with `_e2e`, protecting active development and business data in `laris_pos`.

---

## 2. Core Tables & Multi-Tenant Integrity

- **Identity & SaaS**: `users` (`is_super_admin`, `is_active`), `merchants`, `outlets`, `outlet_settings`, `merchant_memberships` (`MERCHANT_OWNER`, `CASHIER`), `subscription_plans`, `plan_features`, `subscriptions` (`TRIAL`, `ACTIVE`, `EXPIRED`, `SUSPENDED`, `CANCELLED`).
- **Catalog & Tables**: `categories`, `products`, `product_variants`, `product_addons`, `dining_tables`, `table_qr_codes` (`token_hash`, `public_token`, `revoked_at`), `legacy_qr_mappings`, `table_sessions`.
- **Transactions & Audit**: `orders`, `order_items` (immutable snapshots + JSONB `selections`), `order_item_addons`, `payments`, `audit_logs`.

### Key Database Constraints & Indexes
- `orders_merchant_idempotency_idx`: Unique `(merchant_id, idempotency_key)` preventing duplicate order submission under retries or double taps.
- `orders_paid_queue_check` (`0013_integrity_constraints.sql`): `CHECK (order_status NOT IN ('NEW_ORDER', 'IN_PROGRESS') OR payment_status = 'PAID')` — database-level guarantee of **Pay First, Order Later**.
- `orders_history_idx` & `payments_status_created_idx`: Composite indexes supporting fast `Asia/Jakarta` date-filtered pagination and CSV exports.

---

## 3. Legacy JSON Migration (`server/scripts/migrate-legacy-json.ts`)

`data/pos-state.json` is preserved strictly as a read-only legacy archive and is never read or written by the runtime server.

- Validate & test migration without committing changes:
  ```bash
  npx tsx server/scripts/migrate-legacy-json.ts --dry-run
  ```
- Execute idempotent import:
  ```bash
  OWNER_EMAIL="owner@lariscoffee.id" OWNER_PASSWORD="<min-10-chars>" npm run db:import-legacy
  ```
- Maps legacy categories, products, variants, toppings, tables, legacy QR tokens (`legacy_qr_mappings`), and verified `LUNAS` (`CASH`/`QRIS`) historical orders while explicitly reporting unsupported prototype records (`E_WALLET`, `BANK_TRANSFER`, `BELUM_DIBAYAR`) and reconciling financial totals before `COMMIT`.
