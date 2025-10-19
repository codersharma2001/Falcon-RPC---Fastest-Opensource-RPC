import { config } from 'dotenv';
import { z } from 'zod';

config();

const envSchema = z.object({
  DATABASE_URL: z.string().url().default('postgres://openpayg:openpayg@localhost:5432/openpayg'),
  BILLING_CRON_INTERVAL_SECONDS: z.coerce.number().default(60),
  BILLING_ENGINE_PORT: z.coerce.number().default(8090),
  LOG_LEVEL: z.string().default('info')
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
