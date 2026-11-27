# WarkopOS — Payment Gateway & Financial Integrity Guide (`PAYMENT_GATEWAY.md`)

Dokumen teknis ini menjadi sumber kebenaran arsitektur, keamanan, operasional lokal, serta prasyarat produksi untuk integrasi **Midtrans Core API v2 Sandbox (Dynamic QRIS)** di platform SaaS multi-tenant **WarkopOS**.

---

## 1. Payment Architecture Overview

WarkopOS menggunakan arsitektur **Modular Monolith** dengan pemisahan domain yang tegas antara status pesanan operasional, status pembayaran internal, status penyedia pembayaran eksternal, rekonsiliasi keuangan, serta penagihan langganan SaaS:

- **Shared Transaction Engine** (`server/modules/orders/service.ts`):
  - Seluruh pesanan dari **Customer QR Ordering** (`POST /api/public/qr/:token/orders`) dan **Merchant POS Cashier** (`POST /api/v1/orders/manual`) melewati satu mesin transaksi terpusat `createCheckoutOrder()`.
  - Seluruh harga produk, varian, add-on, dan total pembayaran dihitung ulang dari PostgreSQL di sisi server. Nilai harga atau total yang dikirim dari browser diabaikan sepenuhnya.
  - Idempotency dijamin melalui kombinasi `(outlet_id, idempotency_key)` + `pg_advisory_xact_lock` + `request_hash`.
- **Supported Payment Channels**:
  1. `CASH` (`provider = 'INTERNAL'`) — Pembayaran tunai di kasir.
  2. `QRIS` (`provider = 'MANUAL_STATIC'`) — QRIS statis milik merchant yang diverifikasi secara manual oleh kasir/pemilik outlet.
  3. `QRIS_DYNAMIC` (`provider = 'MIDTRANS'`, `environment = 'SANDBOX'`) — QRIS dinamis per transaksi melalui **Midtrans Core API v2** dengan verifikasi server-side otomatis (webhook bertanda tangan SHA-512 + rekonsiliasi Status API).
- **Non-Blocking External Network Pattern**:
  - Koneksi transaksi database (`BEGIN ... COMMIT`) **tidak pernah** ditahan terbuka saat memanggil HTTP eksternal ke Midtrans (`POST /v2/charge` maupun `GET /v2/{order_id}/status`).
  - Saat pemutakhiran status finansial dilakukan, baris `orders` dan `payments` dikunci secara atomik (`SELECT ... FOR UPDATE`), divalidasi kesesuaiannya, dicatat ke `audit_logs`, di-`COMMIT`, lalu disiarkan melalui Server-Sent Events (SSE) ke antrean merchant dan layar pelacakan pelanggan.
- **Pay First, Order Later Enforcement**:
  - Invarian operasional dijaga di level aplikasi dan constraint PostgreSQL (`orders_paid_queue_check`): pesanan pada status `NEW_ORDER` dan `IN_PROGRESS` **wajib** memiliki `payment_status = 'PAID'`, sedangkan `READY_TO_SERVE` hanya mengizinkan `PAID` atau `REFUNDED` (khusus refund pasca-saji yang sah oleh `MERCHANT_OWNER`).
  - Konfirmasi manual kasir (`POST /api/v1/payments/:orderId/confirm`) secara eksplisit **memblokir (`409 Conflict`)** transaksi `QRIS_DYNAMIC` agar kasir atau klien tidak dapat memalsukan status lunas tanpa konfirmasi otoritatif Midtrans.

---

## 2. Official Provider Specification Used

Integrasi ini menggunakan spesifikasi resmi **Midtrans Core API v2 (Non-BI-SNAP)** secara konsisten dan **tidak mencampur** autentikasi, payload, maupun algoritma tanda tangan BI-SNAP:

| Komponen | Spesifikasi Resmi yang Digunakan |
| --- | --- |
| Base URL Sandbox | `https://api.sandbox.midtrans.com` |
| Autentikasi HTTP | HTTP Basic Auth: `Authorization: Basic base64(MIDTRANS_SERVER_KEY + ":")` |
| Pembuatan QRIS Dinamis | `POST /v2/charge` (`payment_type: "qris"`, `qris.acquirer: "gopay"`, `custom_expiry`) |
| Pengecekan Status Otoritatif | `GET /v2/{order_id}/status` |
| Override URL Webhook (Opsional) | Header `X-Override-Notification: https://<public-https-domain>/api/webhooks/midtrans` |
| Verifikasi Webhook HTTPS | `SHA512(order_id + status_code + gross_amount + SecretKey)` dengan `crypto.timingSafeEqual` |

Referensi dokumentasi resmi Midtrans:
- QRIS Core API: https://docs.midtrans.com/reference/qris
- HTTPS Notification Webhooks: https://docs.midtrans.com/docs/https-notification-webhooks
- Get Transaction Status: https://docs.midtrans.com/reference/get-transaction-status
- Testing Payment on Sandbox: https://docs.midtrans.com/docs/testing-payment-on-sandbox
- Access Keys: https://docs.midtrans.com/docs/access-keys

---

## 3. Sandbox Account Setup & Environment Variables

### Langkah Menyiapkan Akun Midtrans Sandbox
1. Masuk ke dashboard Midtrans melalui https://dashboard.midtrans.com dan pastikan selector lingkungan berada pada **Sandbox** (bukan Production).
2. Buka menu **Settings → Access Keys** dan salin **Server Key** Sandbox (berawalan `SB-Mid-server-...`).
3. Tentukan **satu** merchant uji di database lokal WarkopOS (misalnya `laris-coffee` atau UUID merchant terkait) untuk diisi ke `MIDTRANS_SANDBOX_MERCHANT_ID`.

### Variabel Lingkungan (`.env`)

Tambahkan variabel berikut pada file `.env` lokal Anda (lihat `.env.example` — jangan pernah melakukan commit nilai kunci asli ke Git):

```dotenv
MIDTRANS_ENABLED=true
MIDTRANS_ENVIRONMENT=sandbox
MIDTRANS_SERVER_KEY=SB-Mid-server-xxxxxxxxxxxxxxxxxxxx
# Opsional bila akun menggunakan signature key terpisah; jika kosong memakai MIDTRANS_SERVER_KEY
MIDTRANS_SIGNATURE_KEY=
# Wajib diisi dengan UUID atau slug dari SATU merchant uji sandbox yang ditunjuk
MIDTRANS_SANDBOX_MERCHANT_ID=laris-coffee
# Opsional: URL publik HTTPS (mis. tunnel resmi Anda sendiri) agar Midtrans mengirim webhook otomatis
PAYMENT_WEBHOOK_BASE_URL=
```

> **Catatan Keselamatan Produksi**:
> Server secara aktif menolak (`productionBlockedReason`) apabila `MIDTRANS_ENVIRONMENT=production` atau jika `MIDTRANS_SERVER_KEY` menggunakan prefix produksi `Mid-server-...`. Aplikasi juga tetap berjalan normal sepenuhnya (Tunai & QRIS Statis) meskipun variabel `MIDTRANS_*` dikosongkan atau `MIDTRANS_ENABLED=false`.

---

## 4. Dynamic QRIS Checkout Flow (Customer QR & Merchant POS)

1. **Validasi Kelayakan**:
   - Endpoint menu publik (`GET /api/public/qr/:token/menu`) dan pengaturan outlet (`GET /api/v1/settings`) memeriksa `isMerchantEligibleForDynamicQris(merchantId, merchantSlug, enableDynamicQris)`.
   - Opsi **Pembayaran QRIS Otomatis** hanya ditampilkan jika konfigurasi Sandbox siap, merchant cocok dengan `MIDTRANS_SANDBOX_MERCHANT_ID`, dan toggle outlet `enableDynamicQris` aktif.
2. **Inisiasi Tagihan**:
   - Server menyimpan pesanan berstatus `order_status = 'AWAITING_PAYMENT'`, `payment_status = 'UNPAID'`, dan membuat `provider_order_id` unik berformat `WKP-ORD-<8CHAR>-<6HEX>`.
   - Di luar transaksi DB, server memanggil `POST /v2/charge` ke Midtrans Sandbox dengan `gross_amount` bulat IDR yang sama persis dengan jumlah `item_details`.
   - Payload `qr_string`, URL `actions` (`generate-qr-code-v2` / `generate-qr-code`), `transaction_id`, `acquirer`, dan `expiry_time` disimpan di tabel `payments`.
   - Jika panggilan ke Midtrans gagal atau timeout (`10 detik`), percobaan pembayaran ditandai `FAILED` / `CANCELLED` dan kunci idempotency dibebaskan agar pelanggan dapat mencoba kembali dengan aman.
3. **Tampilan & Peringatan Sandbox**:
   - Komponen `DynamicQrisCard` merender kode QR langsung dari `qr_string` (dengan fallback `qr_image_url`), menampilkan nominal bruto, countdown real-time dari `expires_at` server, lencana peringatan **SANDBOX — Simulasi Tanpa Uang Asli**, tombol salin URL/string QR untuk simulator, serta tombol **Cek Status Pembayaran**.

---

## 5. Webhook Configuration & Local Status Reconciliation

### A. Pemrosesan Webhook (`POST /api/webhooks/midtrans`)
- Jika Anda menyediakan `PAYMENT_WEBHOOK_BASE_URL` berprotokol `https://`, WarkopOS otomatis mengirimkan header `X-Override-Notification: <PAYMENT_WEBHOOK_BASE_URL>/api/webhooks/midtrans` saat memanggil `/v2/charge` (atau Anda dapat mengaturnya di **Settings → Configuration → Payment Notification URL** pada Dashboard Midtrans Sandbox).
- Setiap notifikasi yang masuk melalui tahapan:
  1. Redaksi `signature_key` (`[REDACTED]`) sebelum penyimpanan log.
  2. Verifikasi tanda tangan SHA-512 secara *constant-time* (`timingSafeEqual`). Tanda tangan tidak valid ditolak dengan `401` dan dicatat sebagai `REJECTED` pada `payment_webhook_events`.
  3. Deduplikasi berbasis `dedupe_key` unik di `payment_webhook_events` sehingga pengiriman ulang (*webhook retry*) bersifat idempotent (`200 { duplicate: true }`).
  4. Perlindungan *out-of-order*: notifikasi `pending` atau `expire` yang datang terlambat **setelah** pembayaran `PAID` diabaikan (`OUT_OF_ORDER_IGNORED`) dan tidak pernah menurunkan status pesanan lunas.
  5. Konfirmasi silang server-ke-server ke `GET /v2/{order_id}/status` sebelum mengubah status keuangan di PostgreSQL.

### B. Rekonsiliasi Status Lokal Tanpa Tunnel Publik
Pengembangan lokal **tidak membutuhkan** tunnel publik berbayar atau konfigurasi jaringan khusus. Baik saat webhook belum terkonfigurasi maupun tertunda, WarkopOS menyediakan endpoint rekonsiliasi aman:
- **Pelanggan (Tracking)**: `POST /api/public/tracking/:token/reconcile` (dilindungi *rate limiter* + *cooldown* `1,5 detik` per transaksi).
- **Merchant / Kasir POS**: `POST /api/v1/payments/:orderId/reconcile` (wajib sesi autentikasi tenant pemilik pesanan).
- **Invoice Langganan SaaS**: `POST /api/v1/subscription/invoices/:id/reconcile` (khusus `MERCHANT_OWNER`).

---

## 6. Step-by-Step Midtrans Simulator Testing Instructions

> **PERINGATAN KESELAMATAN**: Jangan pernah memindai kode QRIS Sandbox menggunakan aplikasi mobile banking atau dompet digital asli. Selalu gunakan Simulator Resmi Midtrans.

1. Pastikan `.env` memiliki `MIDTRANS_ENABLED=true`, `MIDTRANS_ENVIRONMENT=sandbox`, `MIDTRANS_SERVER_KEY=SB-Mid-server-...`, dan `MIDTRANS_SANDBOX_MERCHANT_ID=<slug-merchant-anda>`.
2. Jalankan `npm run db:migrate && npm run dev`.
3. Buka halaman pemesanan meja merchant tersebut (`/q/<qrToken>`) atau halaman **Kasir POS** (`/admin/pos`).
4. Pilih menu, lanjut ke checkout, pilih **Pembayaran QRIS Otomatis**, lalu klik **Buat QRIS Otomatis**.
5. Pada kartu QRIS yang muncul:
   - Klik **Salin URL Gambar QR** (atau **Salin String QR**).
   - Klik tautan **Buka Simulator Midtrans** (`https://simulator.sandbox.midtrans.com/v2/qris/index`).
6. Di halaman Midtrans QRIS Simulator, tempel URL gambar QR ke kolom yang tersedia, klik **Scan QR**, periksa detail merchant & nominal, lalu klik **Pay**.
7. Kembali ke tab WarkopOS:
   - Jika `PAYMENT_WEBHOOK_BASE_URL` HTTPS aktif, layar pelanggan & antrean barista otomatis berubah menjadi **Lunas / Pesanan Masuk (`NEW_ORDER`)** secara real-time melalui SSE.
   - Jika berjalan murni di `localhost` tanpa webhook publik, klik tombol **Cek Status Pembayaran**; WarkopOS akan memanggil `GET /v2/{order_id}/status` ke Midtrans Sandbox dan memverifikasi pembayaran seketika.

---

## 7. Multi-Tenant Merchant Payment Ownership Model

WarkopOS adalah platform SaaS untuk banyak merchant independen. Dana pembelian makanan & minuman pelanggan adalah milik masing-masing merchant, **bukan** otomatis milik platform WarkopOS:

- **Fase Saat Ini (Designated Sandbox Test Merchant)**:
  - Satu kredensial Sandbox server dikunci secara eksplisit hanya ke **satu** merchant uji melalui `MIDTRANS_SANDBOX_MERCHANT_ID` (pencocokan terhadap `merchants.id` atau `merchants.slug`).
  - Seluruh merchant lain di database otomatis ditolak (`eligible: false`) baik di UI maupun di validasi server (`400 Bad Request`) dan tidak dapat membaca, memakai, atau merekonsiliasi transaksi milik merchant uji tersebut (`404 Not Found`).
- **Pemisahan Pendapatan F&B vs Tagihan SaaS Platform**:
  - Pembayaran pesanan F&B menggunakan prefix `WKP-ORD-*` pada tabel `orders` + `payments`.
  - Tagihan langganan WarkopOS menggunakan tabel terpisah `subscription_invoices` (`WKP-SUB-*`) melalui `/api/v1/subscription/invoices`. Pembuatan invoice **tidak** langsung mengaktifkan paket; status `subscriptions` baru diperbarui ke `ACTIVE` setelah settlement terverifikasi dari Midtrans.
- **Pemisahan Laporan Keuangan Sandbox vs Produksi**:
  - Seluruh transaksi berlabel `environment = 'SANDBOX'` **dikecualikan** dari KPI pendapatan produksi / GMV utama pada Dashboard Merchant (`/admin/dashboard`), Riwayat Transaksi (`/admin/history`), ekspor CSV, dan Platform Overview Super Admin (`/super-admin`). Volume uji Sandbox ditampilkan secara terpisah dan transparan sebagai volume simulasi bruto (sebelum potongan MDR penyedia).

---

## 8. Transaction & Payment State Mapping Table

| Midtrans `transaction_status` | `fraud_status` | Disposisi Internal | Status `payments.status` | Status `orders.order_status` | Catatan Rekonsiliasi |
| --- | --- | --- | --- | --- | --- |
| `pending` | `accept` / `null` | `PENDING` | `UNPAID` | `AWAITING_PAYMENT` | Menunggu pembayaran pelanggan; belum masuk antrean barista. |
| `settlement` | `accept` / `null` | `SETTLED` | `PAID` | `NEW_ORDER` | Diverifikasi lunas; masuk antrean operasional barista & disiarkan via SSE. |
| `capture` | `accept` | `SETTLED` | `PAID` | `NEW_ORDER` | Setara settlement terverifikasi. |
| `capture` / `settlement` | `challenge` | `PENDING` | `UNPAID` | `AWAITING_PAYMENT` | Ditahan menunggu hasil peninjauan fraud. |
| `expire` | apa pun | `EXPIRED` | `EXPIRED` | `EXPIRED` | Batas waktu QRIS habis; pelanggan diarahkan membuat pesanan baru. |
| `settlement` *(setelah `EXPIRED`)* | `accept` / `null` | `SETTLED` | `PAID` | `NEW_ORDER` | *Late-settlement recovery*: dipulihkan ke `NEW_ORDER` dengan `reconciliation_status = 'LATE_SETTLEMENT_RECOVERED'`. |
| `settlement` *(setelah `CANCELLED`)* | `accept` / `null` | `SETTLED` | tetap tidak mengaktifkan pesanan batal | tetap `CANCELLED` | Ditandai `SETTLED_AFTER_CANCEL_REQUIRES_REFUND` + `audit_logs` untuk tindak lanjut refund manual. |
| `deny` / `cancel` / `failure` | apa pun | `FAILED` | `FAILED` | `CANCELLED` | Pembayaran ditolak/dibatalkan penyedia. |
| `refund` / `partial_refund` / `chargeback` | apa pun | `REFUNDED` | `REFUNDED` | `CANCELLED` (atau tetap `READY_TO_SERVE` bila sudah disajikan) | Dicatat pada `refunded_at` & `audit_logs`. |
| Mismatch nominal / mata uang / ID | apa pun | Quarantined | tetap `UNPAID` | tetap `AWAITING_PAYMENT` | Dikarantina sebagai `QUARANTINED_MISMATCH` + `audit_logs`; **tidak pernah** ditandai `PAID`. |

---

## 9. Security Controls Implemented

1. **Zero Client Secret Exposure**: `MIDTRANS_SERVER_KEY` dan `MIDTRANS_SIGNATURE_KEY` hanya dibaca di backend Node.js, tidak memiliki prefix `VITE_`, dan tidak pernah dikembalikan oleh endpoint API mana pun.
2. **Production Kill-Switch**: Pemblokiran keras terhadap `MIDTRANS_ENVIRONMENT=production` maupun Server Key produksi berawalan `Mid-server-...`.
3. **Constant-Time Webhook Verification & Payload Redaction**: Validasi `SHA-512` menggunakan `timingSafeEqual` dan penyamaran nilai `signature_key` menjadi `[REDACTED]` sebelum disimpan ke `payment_webhook_events`.
4. **Two-Step Authoritative Verification**: Webhook tidak dipercaya secara buta; backend selalu memanggil `GET /v2/{order_id}/status` untuk memvalidasi `order_id`, `transaction_id`, `gross_amount`, `payment_type === 'qris'`, dan `currency === 'IDR'`.
5. **Quarantine on Financial Mismatch**: Ketidakcocokan `gross_amount` atau identitas transaksi langsung dikarantina (`QUARANTINED_MISMATCH`) tanpa meloloskan pesanan ke dapur.
6. **Manual Override Prevention**: Kasir tidak dapat menekan verifikasi manual (`409 Conflict`) untuk pesanan `QRIS_DYNAMIC`.
7. **Database-Level Invariant (`orders_paid_queue_check`)**: PostgreSQL menolak baris `NEW_ORDER` / `IN_PROGRESS` yang belum `PAID` serta menjaga `READY_TO_SERVE` hanya untuk `PAID` / `REFUNDED`.

---

## 10. Running Automated Tests vs Live Sandbox Verification

### Pengujian Otomatis Terisolasi (Mocked Provider — Tanpa Kredensial Eksternal)
Seluruh pengujian otomatis berjalan terhadap PostgreSQL lokal terisolasi (`laris_pos_vitest_e2e` & `laris_pos_e2e` pada port `5433`) menggunakan server HTTP mock Midtrans Core API v2 lokal sehingga deterministik dan aman dijalankan kapan pun:

```bash
# 1. Pemeriksaan tipe TypeScript
npm run lint

# 2. Build bundle produksi frontend
npm run build

# 3. Unit & PostgreSQL integration tests (termasuk 12 grup skenario Midtrans Phase 2)
npm test

# 4. Browser E2E Playwright (termasuk alur Dynamic QRIS Customer, POS, Webhook SSE & Expired)
npm run test:e2e
```

### Pengujian Live Midtrans Sandbox (Dengan Akun Sandbox Asli)
1. Isi `MIDTRANS_ENABLED=true`, `MIDTRANS_ENVIRONMENT=sandbox`, `MIDTRANS_SERVER_KEY=SB-Mid-server-...`, dan `MIDTRANS_SANDBOX_MERCHANT_ID=<slug-merchant>` pada `.env`.
2. Jalankan `npm run dev`, buka `/admin/settings` pada merchant tersebut, dan pastikan indikator menampilkan **Siap Digunakan (Sandbox)**.
3. Buat transaksi QRIS Otomatis dari `/q/<qrToken>` atau `/admin/pos`, selesaikan melalui https://simulator.sandbox.midtrans.com/v2/qris/index, lalu verifikasi perubahan status via tombol **Cek Status Pembayaran** atau webhook HTTPS.

---

## 11. Production Activation Prerequisites & Remaining Limitations

Sebelum pembayaran uang asli (`PRODUCTION`) boleh diaktifkan di masa depan, prasyarat bisnis, kepatuhan, dan teknis berikut **wajib** diselesaikan terlebih dahulu:

1. **Model Kepemilikan Merchant & Onboarding Penyedia**:
   - Menentukan skema resmi bersama Midtrans / penyedia berlisensi BI: apakah setiap merchant menyimpan kredensial akun Midtrans miliknya sendiri secara terenkripsi (KMS / AES-256-GCM per-tenant) atau menggunakan produk platform/sub-merchant resmi yang disetujui penyedia.
   - **Dilarang** mengarahkan transaksi produksi berbagai merchant independen ke satu rekening Midtrans milik platform tanpa skema agregasi/split-settlement resmi yang sah secara hukum dan regulasi Bank Indonesia.
2. **Persetujuan Akun Produksi & QRIS Acquirer Resmi**:
   - Verifikasi legalitas badan usaha/merchant (KYC/KYB), aktivasi kontrak produksi QRIS Midtrans, dan pengujian nilai MDR (Merchant Discount Rate) serta jadwal pencairan dana (*settlement payout*).
3. **Akuntansi Bruto vs Neto (MDR & Rekonsiliasi Payout)**:
   - Saat ini WarkopOS mencatat **nominal bruto yang dibayar pelanggan** (`expected_gross_amount`) dan memberi catatan transparan bahwa potongan MDR penyedia diperhitungkan saat pencairan. Untuk produksi penuh, tambahkan kolom pelacakan biaya MDR penyedia & rekonsiliasi laporan *settlement* bank harian.
4. **Infrastruktur Webhook HTTPS Produksi & Alerting**:
   - Domain HTTPS produksi resmi dengan sertifikat TLS valid, pemantauan antrean `QUARANTINED_MISMATCH` / `SETTLED_AFTER_CANCEL_REQUIRES_REFUND`, serta prosedur operasional *refund* melalui API/Dashboard Midtrans.
