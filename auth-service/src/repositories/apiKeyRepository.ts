import type { PoolClient } from 'pg';
import { pool } from '../db';

export interface ApiKey {
  id: string;
  user_id: string | null;
  name: string | null;
  plan: string;
  api_key_hash: string;
  rate_limit_override: number | null;
  block_range_override: number | null;
  revoked_at: Date | null;
  last_used_at: Date | null;
  created_at: Date;
}

export async function createApiKey(client: PoolClient, params: {
  userId?: string | null;
  name?: string | null;
  plan: string;
  apiKeyHash: string;
  rateLimitOverride?: number | null;
  blockRangeOverride?: number | null;
}): Promise<ApiKey> {
  const { rows } = await client.query<ApiKey>(
    `INSERT INTO api_keys (user_id, name, plan, api_key_hash, rate_limit_override, block_range_override)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      params.userId ?? null,
      params.name ?? null,
      params.plan,
      params.apiKeyHash,
      params.rateLimitOverride ?? null,
      params.blockRangeOverride ?? null
    ]
  );
  return rows[0];
}

export async function listApiKeys(): Promise<ApiKey[]> {
  const { rows } = await pool.query<ApiKey>('SELECT * FROM api_keys ORDER BY created_at DESC');
  return rows;
}

export async function findApiKeyById(id: string): Promise<ApiKey | null> {
  const { rows } = await pool.query<ApiKey>('SELECT * FROM api_keys WHERE id = $1', [id]);
  return rows[0] ?? null;
}

export async function findApiKeyByHash(hash: string): Promise<ApiKey | null> {
  const { rows } = await pool.query<ApiKey>('SELECT * FROM api_keys WHERE api_key_hash = $1 LIMIT 1', [hash]);
  return rows[0] ?? null;
}

export async function findActiveApiKeyBySecret(secret: string): Promise<ApiKey | null> {
  const { rows } = await pool.query<ApiKey>(
    `SELECT *
     FROM api_keys
     WHERE revoked_at IS NULL
       AND api_key_hash = crypt($1, api_key_hash)
     LIMIT 1`,
    [secret]
  );
  return rows[0] ?? null;
}

export async function revokeApiKey(id: string): Promise<void> {
  await pool.query('UPDATE api_keys SET revoked_at = NOW() WHERE id = $1', [id]);
}

export async function usageForKey(id: string): Promise<{ method: string; total: number; byte_count: number }[]> {
  const { rows } = await pool.query<{ method: string; total: string; byte_count: string }>(
    `SELECT method, SUM(request_count) as total, SUM(byte_count) as byte_count
     FROM usage_logs
     WHERE api_key_id = $1
     GROUP BY method
     ORDER BY total DESC`,
    [id]
  );
  return rows.map(row => ({
    method: row.method,
    total: Number(row.total),
    byte_count: Number(row.byte_count)
  }));
}
