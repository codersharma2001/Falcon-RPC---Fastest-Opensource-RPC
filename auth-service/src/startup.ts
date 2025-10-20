import type { PoolClient } from 'pg';
import { pool, withTransaction } from './db';
import { env } from './env';
import { createUser, findUserByEmailWithClient } from './repositories/userRepository';
import { createApiKey } from './repositories/apiKeyRepository';
import { hashSecret } from './security';

const ADMIN_KEY_NAME = 'Admin Default Key';

export async function ensureAdminBootstrap(): Promise<void> {
  await ensureSchemaCompatibility();
  await withTransaction(async client => {
    let user = await findUserByEmailWithClient(client, env.ADMIN_EMAIL);
    if (!user) {
      const passwordHash = await hashSecret(env.ADMIN_PASSWORD);
      user = await createUser(client, env.ADMIN_EMAIL, passwordHash, 'admin');
    }
    await ensureAdminApiKey(client, user.id);
  });
}

async function ensureSchemaCompatibility(): Promise<void> {
  await pool.query('ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS api_key_plaintext TEXT');
}

async function ensureAdminApiKey(client: PoolClient, userId: string): Promise<void> {
  const { rows } = await client.query('SELECT id, api_key_plaintext FROM api_keys WHERE name = $1 LIMIT 1', [ADMIN_KEY_NAME]);
  if (rows.length > 0) {
    const existingId = rows[0].id as string;
    await client.query(
      'UPDATE api_keys SET api_key_plaintext = COALESCE(api_key_plaintext, $1) WHERE id = $2',
      [env.ADMIN_DEFAULT_API_KEY, existingId]
    );
    return;
  }
  const hashed = await hashSecret(env.ADMIN_DEFAULT_API_KEY);
  await createApiKey(client, {
    userId,
    name: ADMIN_KEY_NAME,
    plan: env.ADMIN_DEFAULT_PLAN,
    apiKeyHash: hashed,
    apiKeyPlaintext: env.ADMIN_DEFAULT_API_KEY
  });
}
