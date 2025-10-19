import { pool } from './db';

interface UsageParams {
  apiKeyId: string;
  method: string;
  byteCount: number;
  blockRange?: number | null;
  success: boolean;
  errorCode?: string | null;
}

export async function recordUsage(params: UsageParams): Promise<void> {
  await pool.query(
    `INSERT INTO usage_logs (api_key_id, method, request_count, byte_count, block_range, success, error_code)
     VALUES ($1, $2, 1, $3, $4, $5, $6)`,
    [
      params.apiKeyId,
      params.method,
      params.byteCount,
      params.blockRange ?? null,
      params.success,
      params.errorCode ?? null
    ]
  );
}

export async function recordMetricSample(apiKeyId: string, method: string, durationMs: number, success: boolean): Promise<void> {
  await pool.query(
    `INSERT INTO node_metrics (api_key_id, method, duration_ms, success)
     VALUES ($1, $2, $3, $4)`,
    [apiKeyId, method, Math.round(durationMs), success]
  );
}
