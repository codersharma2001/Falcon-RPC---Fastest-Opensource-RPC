import type { PlanContext } from './types';
import { pool } from './db';

export async function resolveApiKey(apiKey: string): Promise<PlanContext | null> {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT ak.id, ak.plan, ak.rate_limit_override, ak.block_range_override,
              p.rate_limit_per_minute, p.max_block_range, p.monthly_quota, p.price_per_1k
       FROM api_keys ak
       JOIN plans p ON ak.plan = p.name
       WHERE ak.revoked_at IS NULL
         AND ak.api_key_hash = crypt($1, ak.api_key_hash)
       LIMIT 1`,
      [apiKey]
    );

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0] as any;
    const rateLimitPerMinute = Number(row.rate_limit_per_minute);
    const maxBlockRange = Number(row.max_block_range);
    const monthlyQuota = Number(row.monthly_quota);
    const pricePer1k = Number(row.price_per_1k);
    const rateLimitOverride = row.rate_limit_override !== null ? Number(row.rate_limit_override) : null;
    const blockRangeOverride = row.block_range_override !== null ? Number(row.block_range_override) : null;

    return {
      apiKeyId: row.id,
      plan: {
        name: row.plan,
        rate_limit_per_minute: rateLimitPerMinute,
        max_block_range: maxBlockRange,
        monthly_quota: monthlyQuota,
        price_per_1k: pricePer1k
      },
      rateLimit: rateLimitOverride ?? rateLimitPerMinute,
      maxBlockRange: blockRangeOverride ?? maxBlockRange
    };
  } finally {
    client.release();
  }
}

export async function touchApiKey(apiKeyId: string): Promise<void> {
  await pool.query('UPDATE api_keys SET last_used_at = NOW() WHERE id = $1', [apiKeyId]);
}
