import { pool } from './db';
import { env } from './env';

export class RateLimitError extends Error {
  statusCode = 429;
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitError';
  }
}

export async function enforceRateLimit(apiKeyId: string, limit: number): Promise<void> {
  const windowMs = env.RPC_PROXY_RATE_LIMIT_WINDOW;
  const now = Date.now();
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);

  const { rows } = await pool.query<{ request_count: number; window_start: Date }>(
    `INSERT INTO rate_limit_counters (api_key_id, window_start, request_count)
     VALUES ($1, $2, 1)
     ON CONFLICT (api_key_id)
     DO UPDATE SET
       request_count = CASE
         WHEN rate_limit_counters.window_start = EXCLUDED.window_start
           THEN rate_limit_counters.request_count + 1
         ELSE 1
       END,
       window_start = CASE
         WHEN rate_limit_counters.window_start = EXCLUDED.window_start
           THEN rate_limit_counters.window_start
         ELSE EXCLUDED.window_start
       END
     RETURNING request_count, window_start`,
    [apiKeyId, windowStart]
  );

  const counter = rows[0];
  if (!counter) {
    return;
  }

  if (counter.window_start.getTime() === windowStart.getTime() && counter.request_count > limit) {
    throw new RateLimitError('Rate limit exceeded');
  }
}
