import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

const SALT_ROUNDS = 12;

export async function hashSecret(secret: string): Promise<string> {
  return await bcrypt.hash(secret, SALT_ROUNDS);
}

export async function verifySecret(secret: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(secret, hash);
}

export function generateApiKey(): string {
  return randomBytes(32).toString('hex');
}
