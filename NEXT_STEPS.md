# WarkopOS — Current Checkpoint & Next Executable Steps

## Current Status (Phase 2 Complete — Midtrans Sandbox Dynamic QRIS & Financial Integrity)

- **Branch**: `codex/saas-foundation-audit` (local commits only; not merged to `main` and not pushed to remote)
- **PostgreSQL 16**: Healthy on isolated host port `127.0.0.1:5433` (`laris_pos` with migrations `0000`–`0014`, `laris_pos_vitest_e2e`, `laris_pos_e2e`)
- **Verification Gates**:
  - `npm run lint` (`tsc --noEmit`): Exit `0`
  - `npm run build` (`vite build`): Exit `0`
  - `npm test` (`vitest run`): Exit `0` (`3` files, `21/21` unit + PostgreSQL integration tests passed — mocked Midtrans Core API v2)
  - `npm run test:e2e` (`playwright test`): Exit `0` (full browser regression + mocked Midtrans Sandbox Dynamic QRIS E2E across `390×844`, `768×1024`, `1440×900`)
- **Live Midtrans Sandbox Status**:
  - Local `.env` currently does not contain `MIDTRANS_SERVER_KEY`; therefore all automated verification used isolated local HTTP mocks of Midtrans Core API v2. No real money or production credentials were touched.

---

## Exact Next Executable Steps

### A. Optional 2-Minute Live Midtrans Sandbox Verification (Owner Action)
1. Add Sandbox credentials to local `.env` (see [PAYMENT_GATEWAY.md](./PAYMENT_GATEWAY.md)):
   ```dotenv
   MIDTRANS_ENABLED=true
   MIDTRANS_ENVIRONMENT=sandbox
   MIDTRANS_SERVER_KEY=SB-Mid-server-<your-sandbox-key>
   MIDTRANS_SANDBOX_MERCHANT_ID=<designated-merchant-slug-or-uuid>
   ```
2. Start the server (`npm run dev`), verify **Siap Digunakan (Sandbox)** in `/admin/settings`, create a **QRIS Otomatis** order via QR or POS, pay it in `https://simulator.sandbox.midtrans.com/v2/qris/index`, and click **Cek Status Pembayaran** (or receive HTTPS webhook via `PAYMENT_WEBHOOK_BASE_URL`).

### B. Phase 3 Roadmap (Production Multi-Tenant Payment Onboarding & MDR Settlement)
1. **Approved Multi-Tenant Provider Architecture**:
   - Finalize legal/commercial onboarding model with Midtrans (encrypted per-merchant Midtrans credentials via KMS/AES-256-GCM vs approved Midtrans Platform/Iris sub-merchant payout arrangement).
2. **Net Settlement & Provider MDR Fee Ledger**:
   - Extend `payments` with `provider_fee_amount` and `net_settlement_amount` reconciled against official Midtrans payout reports before enabling `MIDTRANS_ENVIRONMENT=production`.
3. **Production Deployment** (see [DEPLOYMENT.md](./DEPLOYMENT.md)):
   - Provision TLS domain, managed PostgreSQL 16, production `JWT_SECRET`, and HTTPS webhook monitoring/alerting for `QUARANTINED_MISMATCH` and `SETTLED_AFTER_CANCEL_REQUIRES_REFUND` events.
