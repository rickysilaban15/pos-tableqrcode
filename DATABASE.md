# Database Development

This project uses PostgreSQL 16 and Drizzle ORM (`server/database/schema.ts`). npm is the sole package manager; `bun.lock` was removed deliberately.

## Local macOS / Apple Silicon

1. Start Docker Desktop.
2. `docker compose up -d`
3. Copy `.env.example` to `.env` and set `DATABASE_URL=postgresql://laris:laris_local_only@127.0.0.1:5433/laris_pos` plus a random `JWT_SECRET` of at least 32 characters.
4. `npm install`
5. `npm run db:migrate`
6. `npm run db:seed`
7. `npm run dev`

The Compose port is explicitly bound to `127.0.0.1:5433`, so local PostgreSQL is not exposed on the LAN. Port 5432 was already owned by an unrelated local PostgreSQL instance on the development machine.

The migration runner records applied files in `_laris_migrations` and runs every migration in one database transaction. `db:seed` is idempotent and creates Basic, Pro and Business plans with feature entitlements.

## Data migration

The legacy JSON state remains temporarily for compatibility with the existing demo routes. It is not a production migration source. Before enabling PostgreSQL-only production mode, export each merchant's legacy state, map it to merchant/outlet records, import it in a transaction, reconcile totals, and verify tenant boundaries. Do not point production at the JSON data directory.

## Security model

`merchant_id` and `outlet_id` scope business records. Authenticated claims contain tenant context and must be used by every protected repository query; browser-supplied tenant IDs are not authority. Row-level security is a planned additional PostgreSQL guard after the feature repositories are moved from the legacy adapter.
