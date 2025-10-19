import { pool } from '../db';

interface BillingRecordRow {
  id: number;
  api_key_id: string;
  plan: string;
  billing_period_start: string;
  billing_period_end: string;
  total_requests: string;
  included_requests: string;
  overage_requests: string;
  amount_due: string;
  currency: string;
  generated_at: string;
}

export interface BillingRecord {
  id: number;
  api_key_id: string;
  plan: string;
  billing_period_start: string;
  billing_period_end: string;
  total_requests: number;
  included_requests: number;
  overage_requests: number;
  amount_due: number;
  currency: string;
  generated_at: string;
}

export async function getBillingForKey(apiKeyId: string, limit = 12): Promise<BillingRecord[]> {
  const { rows } = await pool.query<BillingRecordRow>(
    `SELECT *
     FROM billing_records
     WHERE api_key_id = $1
     ORDER BY billing_period_start DESC
     LIMIT $2`,
    [apiKeyId, limit]
  );
  return rows.map(mapBillingRow);
}

export async function getCurrentPeriodBilling(): Promise<BillingRecord[]> {
  const { rows } = await pool.query<BillingRecordRow>(
    `SELECT *
     FROM billing_records
     WHERE DATE_TRUNC('month', billing_period_start) = DATE_TRUNC('month', CURRENT_DATE)`
  );
  return rows.map(mapBillingRow);
}

function mapBillingRow(row: BillingRecordRow): BillingRecord {
  return {
    ...row,
    total_requests: Number(row.total_requests),
    included_requests: Number(row.included_requests),
    overage_requests: Number(row.overage_requests),
    amount_due: Number(row.amount_due)
  };
}
