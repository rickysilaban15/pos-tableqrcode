# LARIS POS

Prototype fondasi QR ordering dan POS untuk F&B. Bahasa antarmuka Indonesia dan mata uang Rupiah.

## Menjalankan lokal

```bash
npm install
docker compose up -d
cp .env.example .env
npm run db:migrate
npm run db:seed
npm run dev
```

For the pre-existing visual demo without PostgreSQL, `npm run dev` continues to work. PostgreSQL-backed authentication requires `DATABASE_URL` and `JWT_SECRET`. See [DATABASE.md](DATABASE.md).

Buka `http://localhost:3000`. Untuk mengaktifkan reset demo lokal, tetapkan `ENABLE_DEMO_RESET=true` di `.env`; endpoint tersebut tidak tersedia pada production.

## Verifikasi

```bash
npm run lint
npm run build
NODE_ENV=production npm start
```

## Status

Saat ini repository adalah prototype satu-merchant dengan file persistence. Ia bukan deployment production atau SaaS multi-tenant. Lihat [AUDIT.md](AUDIT.md), [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md), [ARCHITECTURE.md](ARCHITECTURE.md), dan [ROADMAP.md](ROADMAP.md) untuk status, risiko, dan rencana migrasi.

Jangan menyimpan secret, kredensial database, token payment provider, atau private key dalam repository.
