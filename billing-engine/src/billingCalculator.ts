import { pool } from './db';
import { billingRuns, billingErrors, outstandingAmount } from './metrics';

function currentPeriod() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return { start, end };
}

export function computeBilling(totalRequests: number, monthlyQuota: number, pricePer1k: number) {
  const included = monthlyQuota === 0 ? 0 : monthlyQuota;
  const overage = monthlyQuota === 0 ? totalRequests : Math.max(totalRequests - monthlyQuota, 0);
  const amount = (overage / 1000) * pricePer1k;
  return { included, overage, amount };
}

export async function runBillingCycle(): Promise<void> {
  const { start, end } = currentPeriod();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO billing_records (
         api_key_id,
         plan,
         billing_period_start,
         billing_period_end,
         total_requests,
         included_requests,
         overage_requests,
         amount_due,
         currency
       )
       SELECT
         ak.id,
         ak.plan,
         $1::date AS period_start,
         $2::date AS period_end,
         COALESCE(SUM(ul.request_count), 0) AS total_requests,
         CASE WHEN p.monthly_quota = 0 THEN 0 ELSE p.monthly_quota END AS included_requests,
         CASE
           WHEN p.monthly_quota = 0 THEN COALESCE(SUM(ul.request_count), 0)
           ELSE GREATEST(COALESCE(SUM(ul.request_count), 0) - p.monthly_quota, 0)
         END AS overage_requests,
         ROUND(
           (
             CASE
               WHEN p.monthly_quota = 0 THEN COALESCE(SUM(ul.request_count), 0)
               ELSE GREATEST(COALESCE(SUM(ul.request_count), 0) - p.monthly_quota, 0)
             END
           )::numeric / 1000 * p.price_per_1k,
           4
         ) AS amount_due,
         'USD' AS currency
       FROM api_keys ak
       JOIN plans p ON ak.plan = p.name
       LEFT JOIN usage_logs ul
         ON ul.api_key_id = ak.id
        AND ul.recorded_at >= $1
        AND ul.recorded_at < ($2 + INTERVAL '1 day')
       WHERE ak.revoked_at IS NULL
       GROUP BY ak.id, ak.plan, p.monthly_quota, p.price_per_1k
       ON CONFLICT (api_key_id, billing_period_start, billing_period_end)
       DO UPDATE SET
         total_requests = EXCLUDED.total_requests,
         included_requests = EXCLUDED.included_requests,
         overage_requests = EXCLUDED.overage_requests,
         amount_due = EXCLUDED.amount_due,
         currency = EXCLUDED.currency,
         plan = EXCLUDED.plan
      `,
      [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)]
    );
    await client.query('COMMIT');
    billingRuns.inc();

    const { rows } = await client.query<{ amount_due: number }>(
      `SELECT COALESCE(SUM(amount_due), 0) AS amount_due
       FROM billing_records
       WHERE billing_period_start = $1 AND billing_period_end = $2`,
      [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)]
    );
    outstandingAmount.labels('USD').set(Number(rows[0]?.amount_due ?? 0));
  } catch (error) {
    await client.query('ROLLBACK');
    billingErrors.inc();
    throw error;
  } finally {
    client.release();
  }
}
