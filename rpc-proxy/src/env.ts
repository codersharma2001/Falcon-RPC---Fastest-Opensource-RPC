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
  RPC_PROXY_MAX_CONCURRENCY: z.coerce.number().default(200),
  CL_HEALTH_ENDPOINT: z.string().url().default('http://lighthouse:5052/eth/v1/node/syncing'),
  FALLBACK_RPC_LIST: z.string().default(''),
  FALLBACK_ON_FINALITY: z.string().default('false'),
  OPENRPC_ENABLE: z.string().default('false'),
  OPENRPC_MAX_USER_BLOCK_RANGE: z.coerce.number().default(1_000_000),
  UPSTREAM_MAX_LOG_RANGE: z.coerce.number().default(5_000),
  UPSTREAM_MAX_PARALLEL: z.coerce.number().default(3),
  UPSTREAM_TIMEOUT_MS: z.coerce.number().default(25_000),
  OPENRPC_MAX_LOGS_IN_MEMORY: z.coerce.number().default(50_000)
}).transform(data => ({
  ...data,
  FALLBACK_RPC_ENDPOINTS: data.FALLBACK_RPC_LIST.split(',')
    .map(item => item.trim())
    .filter(item => item.length > 0),
  FALLBACK_ON_FINALITY: data.FALLBACK_ON_FINALITY.toLowerCase() === 'true',
  OPENRPC_ENABLE: data.OPENRPC_ENABLE.toLowerCase() === 'true'
}));

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
