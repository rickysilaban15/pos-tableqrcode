import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url().optional(),
  JWT_SECRET: z.string().min(32).optional(),
  APP_URL: z.string().url().optional(),
  ENABLE_DEMO_RESET: z.enum(['true', 'false']).default('false'),
});

export const env = schema.parse(process.env);
export const hasDatabase = Boolean(env.DATABASE_URL);

export function requireAuthConfig(): { databaseUrl: string; jwtSecret: string } {
  if (!env.DATABASE_URL || !env.JWT_SECRET) {
    throw new Error('DATABASE_URL dan JWT_SECRET wajib diatur untuk authentication.');
  }
  return { databaseUrl: env.DATABASE_URL, jwtSecret: env.JWT_SECRET };
}
