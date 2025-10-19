import { pool } from '../db';

export interface Plan {
  id: number;
  name: string;
  rate_limit_per_minute: number;
  max_block_range: number;
  monthly_quota: number;
  price_per_1k: number;
}

export async function getPlan(name: string): Promise<Plan | null> {
  const { rows } = await pool.query<Plan>('SELECT * FROM plans WHERE name = $1 LIMIT 1', [name]);
  return rows[0] ?? null;
}

export async function listPlans(): Promise<Plan[]> {
  const { rows } = await pool.query<Plan>('SELECT * FROM plans ORDER BY id');
  return rows;
}
