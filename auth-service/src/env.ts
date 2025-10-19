import { config } from 'dotenv';
import { z } from 'zod';

config();

const envSchema = z.object({
  AUTH_SERVICE_PORT: z.coerce.number().default(8080),
  AUTH_JWT_SECRET: z.string().min(16),
  DATABASE_URL: z.string().url(),
  ADMIN_EMAIL: z.string().email(),
  ADMIN_PASSWORD: z.string().min(8),
  ADMIN_DEFAULT_PLAN: z.enum(['free', 'dev', 'pro']).default('pro'),
  ADMIN_DEFAULT_API_KEY: z.string().min(8),
  LOG_LEVEL: z.string().default('info')
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
