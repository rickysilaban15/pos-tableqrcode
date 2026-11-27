import dotenv from 'dotenv';

dotenv.config({ path: '.env.e2e', override: true });

const baseTestUrl = process.env.TEST_DATABASE_URL;
if (!baseTestUrl) {
  throw new Error('TEST_DATABASE_URL wajib diatur di .env.e2e untuk menjalankan pengujian integrasi.');
}
const parsed = new URL(baseTestUrl);
if (!parsed.pathname.endsWith('_e2e')) {
  throw new Error('Menolak menjalankan Vitest pada database yang tidak berakhiran _e2e.');
}

// Isolate Vitest into its own *_vitest_e2e database so it never collides with active dev or Playwright runs.
parsed.pathname = '/laris_pos_vitest_e2e';
process.env.DATABASE_URL = parsed.toString();
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET =
  process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32
    ? process.env.JWT_SECRET
    : 'vitest-isolated-secret-with-minimum-thirty-two-chars';
