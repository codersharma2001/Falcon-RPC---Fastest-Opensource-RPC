import { pool } from '../db';

interface DailyUsageRowDB {
  day: string;
  request_count: string;
}

export interface DailyUsageRow {
  day: string;
  request_count: number;
}

export async function getDailyUsage(apiKeyId: string, days = 30): Promise<DailyUsageRow[]> {
  const { rows } = await pool.query<DailyUsageRowDB>(
    `SELECT to_char(date_trunc('day', recorded_at), 'YYYY-MM-DD') AS day,
            SUM(request_count) AS request_count
     FROM usage_logs
     WHERE api_key_id = $1
       AND recorded_at >= NOW() - ($2::int * INTERVAL '1 day')
     GROUP BY 1
     ORDER BY 1`,
    [apiKeyId, days]
  );
  return rows.map(row => ({ day: row.day, request_count: Number(row.request_count) }));
}

export async function getTopMethods(apiKeyId: string, limit = 5): Promise<{ method: string; total: number }[]> {
  const { rows } = await pool.query<{ method: string; total: string }>(
    `SELECT method, SUM(request_count) AS total
     FROM usage_logs
     WHERE api_key_id = $1
     GROUP BY method
     ORDER BY total DESC
     LIMIT $2`,
    [apiKeyId, limit]
  );
  return rows.map(row => ({ method: row.method, total: Number(row.total) }));
}

export async function getAggregateUsage(): Promise<{ plan: string; total_requests: number }[]> {
  const { rows } = await pool.query<{ plan: string; total_requests: string }>(
    `SELECT ak.plan, COALESCE(SUM(ul.request_count), 0) AS total_requests
     FROM api_keys ak
     LEFT JOIN usage_logs ul ON ul.api_key_id = ak.id
     GROUP BY ak.plan`
  );
  return rows.map(row => ({ plan: row.plan, total_requests: Number(row.total_requests) }));
}
