import ipaddr from 'ipaddr.js';
import { pool } from './db';

export async function isIpAllowed(apiKeyId: string, ip: string): Promise<boolean> {
  const { rows } = await pool.query<{ cidr: string }>(
    'SELECT cidr FROM ip_allow_list WHERE api_key_id = $1',
    [apiKeyId]
  );
  if (rows.length === 0) {
    return true; // no restrictions
  }

  let normalized: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    normalized = ipaddr.parse(ip);
  } catch (_err) {
    return false;
  }

  return rows.some((row: { cidr: string }) => {
    try {
      const cidr = ipaddr.parseCIDR(row.cidr);
      return normalized.match(cidr);
    } catch (_err) {
      return false;
    }
  });
}
