# WarkopOS — Current Checkpoint & Next Executable Steps

## Current Status (Production-Ready MVP Foundation)

- **Branch**: `codex/saas-foundation-audit` (local commits only; not merged to `main` and not pushed to remote)
- **PostgreSQL 16**: Healthy on isolated host port `127.0.0.1:5433` (`laris_pos`, `laris_pos_vitest_e2e`, `laris_pos_e2e`)
- **Verification Gates**:
  - `npm run lint` (`tsc --noEmit`): Exit `0`
  - `npm run build` (`vite build`): Exit `0` (`index.js` `26.17 kB` / `6.21 kB` gzip)
  - `npm test` (`vitest run`): Exit `0` (`2` files, `9/9` unit + PostgreSQL integration tests passed)
  - `npm run test:e2e` (`playwright test`): Exit `0` (`11` passed, `16` cross-project skips — verified across 2 consecutive runs)

---

## Exact Next Executable Steps for Production Launch

1. **Provision Production Environment & Secrets** (see `DEPLOYMENT.md`):
   - Configure `NODE_ENV=production`, `APP_URL=https://<production-domain>`, `DATABASE_URL` (managed PostgreSQL 16 with TLS), and a fresh 48-byte `JWT_SECRET`.
2. **Run Production Build, Migrations & Plan Seed**:
   ```bash
   npm ci && npm run lint && npm run build
   npm run db:migrate && npm run db:seed
   ```
3. **Provision Platform Super Admin**:
   ```bash
   SUPER_ADMIN_EMAIL="admin@<domain>" SUPER_ADMIN_PASSWORD="<strong-secret>" npm run db:create-super-admin
   ```
4. **Optional One-Time Legacy LARIS Coffee Import**:
   ```bash
   npx tsx server/scripts/migrate-legacy-json.ts --dry-run
   OWNER_EMAIL="owner@lariscoffee.id" OWNER_PASSWORD="<strong-secret>" npm run db:import-legacy
   ```
5. **Phase 2 Roadmap (Post-MVP, Requires External Credentials / Scope Authorization)**:
   - Dynamic QRIS & automated payment gateway webhooks (Midtrans / Xendit) with cryptographic signature verification.
   - Transactional email / WhatsApp receipt & trial-expiry notifications.
   - Multi-outlet switcher UI for multi-branch `Business` tier merchants.
