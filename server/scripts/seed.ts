import { pool } from '../database/client.ts';
if (!pool) throw new Error('DATABASE_URL wajib diatur.');
for (const [code, name, price, days, features] of [
  ['basic', 'Basic', 50000, 14, ['ordering', 'basic_pos', 'basic_reports']],
  ['pro', 'Pro', 120000, 14, ['ordering', 'advanced_pos', 'inventory', 'stock_opname', 'report_export']],
  ['business', 'Business', 250000, 14, ['ordering', 'advanced_pos', 'inventory', 'recipes', 'cogs', 'expenses', 'pnl']],
] as const) {
  const plan = (await pool.query('INSERT INTO subscription_plans(code,name,monthly_price,trial_days) VALUES($1,$2,$3,$4) ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name,monthly_price=EXCLUDED.monthly_price,trial_days=EXCLUDED.trial_days RETURNING id', [code, name, price, days])).rows[0];
  for (const feature of features) await pool.query('INSERT INTO plan_features(plan_id,feature_key) VALUES($1,$2) ON CONFLICT(plan_id,feature_key) DO NOTHING', [plan.id, feature]);
}
console.log('Subscription plans seeded.'); await pool.end();
