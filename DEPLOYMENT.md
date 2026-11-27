# WarkopOS Production Deployment Runbook

This runbook documents the production deployment, operations, backup/recovery, security hardening, and rollback procedures for **WarkopOS** (multi-tenant Indonesian F&B SaaS modular monolith).

---

## 1. Environment Variables

Create `.env` on the target server (never commit `.env` to Git; use `.env.example` as template):

| Variable | Required | Description & Example |
| --- | --- | --- |
| `NODE_ENV` | Yes | Set to `production` in production environments. Enables `Secure` cookies, static SPA serving from `dist/`, and disables all dev-only behavior. |
| `PORT` | Yes | HTTP port bound by Express (e.g., `3000` behind Nginx/Caddy/Cloudflare/ALB). |
| `APP_URL` | Yes | Canonical public HTTPS origin (e.g., `https://app.warkopos.id`). Used as the default QR Base URL and validated by the same-origin CSRF mutation guard. |
| `DATABASE_URL` | Yes | PostgreSQL 16 connection URI (`postgresql://<user>:<password>@<host>:<port>/<dbname>?sslmode=require`). Local dev uses isolated host port `5433` (`127.0.0.1:5433`). |
| `JWT_SECRET` | Yes | Cryptographically random secret (`>= 32` characters). Generate via `openssl rand -base64 48`. Rotating this invalidates active sessions cleanly. |
| `ENABLE_DEMO_RESET` | No | Keep `false` (hard-disabled in code whenever `NODE_ENV=production`). |

---

## 2. Build & Startup Sequence

```bash
# 1. Install exact locked dependencies
npm ci

# 2. Type-check TypeScript across frontend + backend
npm run lint

# 3. Build production Vite frontend assets into dist/
npm run build

# 4. Apply versioned SQL migrations transactionally (_laris_migrations)
npm run db:migrate

# 5. Seed/ensure canonical subscription plans (basic, pro, business) idempotently
npm run db:seed

# 6. Start the production Express + static SPA server
NODE_ENV=production npx tsx server.ts
```

For process supervision on a Linux VM or container:
- Run under `systemd`, `pm2`, or Docker with `restart: unless-stopped`, graceful `SIGTERM` handling, and reverse-proxy TLS termination (Caddy, Nginx, or Cloud Load Balancer).
- Ensure reverse proxy forwards `Host`, `X-Forwarded-Proto: https`, and `Origin` headers accurately, and disables response buffering (`X-Accel-Buffering: no`) on `/api/v1/events` and `/api/public/orders/:token/events` so Server-Sent Events stream immediately.

---

## 3. PostgreSQL Setup, Backup & Recovery

### Isolation & Migrations
- Development uses `127.0.0.1:5433` (`laris_pos`), keeping any host PostgreSQL on `5432` untouched.
- Automated Vitest and Playwright suites strictly enforce `_e2e` database name suffixes (`laris_pos_vitest_e2e`, `laris_pos_e2e`) before truncating test tables.
- All schema changes live in `server/database/migrations/0000_*.sql` through `0013_integrity_constraints.sql` and execute inside `BEGIN ... COMMIT` transactions tracked in `_laris_migrations`.

### Backup Procedure (`pg_dump`)
Run daily automated logical backups (plus WAL archiving / managed snapshots where available):

```bash
pg_dump --format=custom --no-owner --no-acl "$DATABASE_URL" \
  --file="warkopos_$(date -u +%Y%m%dT%H%M%SZ).dump"
```

### Recovery & Verification (`pg_restore`)
Always test restoration into a staging database before cutover:

```bash
createdb warkopos_restore_verify
pg_restore --clean --if-exists --no-owner --no-acl \
  --dbname="$STAGING_RESTORE_DATABASE_URL" warkopos_YYYYMMDDTHHMMSSZ.dump
```

---

## 4. Super Admin Provisioning

Super Admin accounts cannot be self-registered via public endpoints. Provision or rotate a Super Admin on the server CLI:

```bash
SUPER_ADMIN_EMAIL="admin@warkopos.id" \
SUPER_ADMIN_PASSWORD="<strong-random-password-min-10-chars>" \
SUPER_ADMIN_NAME="Platform Administrator" \
npm run db:create-super-admin
```

The script hashes the password with `bcrypt`, upserts `is_super_admin = true`, and logs no plaintext secrets.

---

## 5. Legacy LARIS Coffee JSON Migration (Optional One-Time Import)

To migrate historical single-tenant LARIS Coffee data (`data/pos-state.json`) into an isolated PostgreSQL tenant (`laris-coffee`):

```bash
# Step 1: Always execute a Dry Run first (validates & reconciles inside a rolled-back transaction)
npx tsx server/scripts/migrate-legacy-json.ts --dry-run

# Step 2: Run actual idempotent import with explicit owner credentials
OWNER_EMAIL="owner@lariscoffee.id" \
OWNER_PASSWORD="<strong-owner-password>" \
npm run db:import-legacy
```

- **Reconciliation**: Verifies imported categories, products, variants, addons, tables, legacy QR mappings (`legacy_qr_mappings`), and `LUNAS` (`CASH`/`QRIS`) historical orders + revenue sum inside a single PostgreSQL transaction.
- **Unsupported Legacy Records**: Explicitly reports skipped legacy records (`E_WALLET`, `BANK_TRANSFER`, or unpaid `BELUM_DIBAYAR` prototype orders) without silently fabricating paid financial entries.

---

## 6. HTTPS, Cookie Security & QR Base URL Configuration

1. **HTTPS & Cookies**:
   - Session cookies (`laris_session`, 12-hour TTL) are set with `HttpOnly`, `SameSite=Lax`, and `Secure` (`NODE_ENV === 'production'`).
   - State-changing requests (`POST`, `PUT`, `PATCH`, `DELETE`) carrying `laris_session` are protected by `verifySameOriginMutation` (`Sec-Fetch-Site` + `Origin` verification against request host / `APP_URL`).
2. **QR Base URL**:
   - Set `APP_URL="https://app.warkopos.id"` in `.env`.
   - Each merchant can also verify or override their outlet's `QR Base URL` under `/admin/tables` (`Pengaturan Base URL QR Code`). The UI warns immediately if `localhost` or `127.0.0.1` is configured, preventing un-scannable printed table cards.

---

## 7. Health Check, Smoke Tests & Rollback

### Health Endpoint
- `GET /api/health` → returns `200 OK` with `{"ok": true, "databaseConfigured": true, "legacyPosRetired": true}`. Configure load balancers and uptime monitors to poll `/api/health` every 15–30s.

### Post-Deploy Smoke Test Checklist
1. `GET /api/health` returns `200` and `ok: true`.
2. `GET /` loads the WarkopOS landing page over HTTPS with zero console or asset errors; `GET /api/public/plans` returns active plans.
3. Log into `/super-admin/login` and verify `/super-admin` KPIs and audit log render.
4. Log into a canary merchant at `/merchant/login`, verify `/admin` dashboard, `/admin/orders`, `/admin/pos`, and `/admin/history` CSV download.
5. Scan/open a canary `/q/<public_token>` URL from a mobile device on cellular data, place a test order, verify payment in `/admin/orders`, and confirm real-time tracking updates on `/tracking/<tracking_token>`.

### Rollback Plan
1. **Application Rollback**: Revert container image / Git release tag to the previous verified commit and restart the Node process (`systemctl restart warkopos` or container redeploy).
2. **Database Rollback**: Migrations `0000`–`0013` are additive/non-destructive (`IF NOT EXISTS` columns, indexes, and integrity constraints). If an emergency schema rollback is ever required, restore from the pre-deploy `pg_dump` snapshot taken prior to `npm run db:migrate`.

---

## 8. Production Security Checklist

- [x] `NODE_ENV=production` and strong 32+ byte `JWT_SECRET` set from secret manager.
- [x] PostgreSQL bound to private network / VPC (or `127.0.0.1:5433` locally) with TLS in transit.
- [x] `Pay First, Order Later` enforced in both service layer and PostgreSQL `CHECK` constraint (`orders_paid_queue_check`).
- [x] Strict `requireMerchantContext` (`merchant_id` + `outlet_id` from verified JWT) on every `/api/v1/*` route and SSE stream.
- [x] Standalone merchant views (`/admin/kitchen`, `/admin/tables/print`) require authenticated merchant session.
- [x] Customer tracking endpoints (`/api/public/tracking/:token`, `/api/public/orders/:token/events`) scoped strictly to high-entropy per-order tracking tokens.
- [x] Same-origin CSRF mutation middleware active on cookie-authenticated endpoints.
- [x] Product image, logo, QRIS, and QR Base URL inputs validated against `javascript:` / `data:text/html` XSS schemes.
- [x] CSV exports sanitize leading `=`, `+`, `-`, `@`, `\t`, `\r` characters against spreadsheet formula injection.
- [x] Legacy unauthenticated `/api/pos/*` endpoints permanently retired (`410 Gone`), and `/demo` runs strictly in isolated browser memory.
