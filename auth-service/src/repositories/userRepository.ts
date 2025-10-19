import type { PoolClient } from 'pg';
import { pool } from '../db';

export interface User {
  id: string;
  email: string;
  password_hash: string;
  role: string;
  created_at: Date;
  updated_at: Date;
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const { rows } = await pool.query<User>('SELECT * FROM users WHERE email = $1 LIMIT 1', [email]);
  return rows[0] ?? null;
}

export async function findUserByEmailWithClient(client: PoolClient, email: string): Promise<User | null> {
  const { rows } = await client.query<User>('SELECT * FROM users WHERE email = $1 LIMIT 1', [email]);
  return rows[0] ?? null;
}

export async function createUser(client: PoolClient, email: string, passwordHash: string, role: string): Promise<User> {
  const { rows } = await client.query<User>(
    `INSERT INTO users (email, password_hash, role)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [email, passwordHash, role]
  );
  return rows[0];
}
