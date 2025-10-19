import { pool } from '../db';

export interface AllowListEntry {
  id: number;
  api_key_id: string;
  cidr: string;
  created_at: Date;
}

export async function listAllowListEntries(apiKeyId: string): Promise<AllowListEntry[]> {
  const { rows } = await pool.query<AllowListEntry>(
    'SELECT * FROM ip_allow_list WHERE api_key_id = $1 ORDER BY created_at DESC',
    [apiKeyId]
  );
  return rows;
}

export async function addAllowListEntry(apiKeyId: string, cidr: string): Promise<AllowListEntry> {
  const { rows } = await pool.query<AllowListEntry>(
    'INSERT INTO ip_allow_list (api_key_id, cidr) VALUES ($1, $2) RETURNING *',
    [apiKeyId, cidr]
  );
  return rows[0];
}

export async function deleteAllowListEntry(id: number): Promise<void> {
  await pool.query('DELETE FROM ip_allow_list WHERE id = $1', [id]);
}
