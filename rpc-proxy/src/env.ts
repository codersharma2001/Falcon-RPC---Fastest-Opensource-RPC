import { config } from 'dotenv';
import { z } from 'zod';

config();

const envSchema = z.object({
  RPC_PROXY_PORT: z.coerce.number().default(8545),
  RPC_PROXY_WS_PORT: z.coerce.number().default(8546),
  RPC_PROXY_TARGET: z.string().url(),
  RPC_PROXY_WS_TARGET: z.string().url(),
  DATABASE_URL: z.string().url(),
  LOG_LEVEL: z.string().default('info'),
  RPC_PROXY_RATE_LIMIT_WINDOW: z.coerce.number().default(60_000),
  RPC_PROXY_MAX_CONCURRENCY: z.coerce.number().default(200)
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
