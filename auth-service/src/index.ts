import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyCors from '@fastify/cors';
import { env } from './env';
import { authRoutes } from './routes/authRoutes';
import { apiKeyRoutes } from './routes/apiKeyRoutes';
import { ensureAdminBootstrap } from './startup';
import { pool } from './db';
import { updateActiveApiKeys } from './metrics';
import { dashboardRoutes } from './routes/dashboardRoutes';

async function buildServer() {
  const server = Fastify({
    logger: {
      level: env.LOG_LEVEL
    }
  });

  await server.register(fastifyCors, {
    origin: true,
    exposedHeaders: ['x-total-count']
  });

  await server.register(fastifyJwt, {
    secret: env.AUTH_JWT_SECRET
  });

  server.addHook('onClose', async () => {
    await pool.end();
  });

  await server.register(authRoutes);
  await server.register(apiKeyRoutes);
  await server.register(dashboardRoutes);

  return server;
}

async function init() {
  try {
    await ensureAdminBootstrap();
    const { rows } = await pool.query<{ count: string }>('SELECT COUNT(*)::text as count FROM api_keys WHERE revoked_at IS NULL');
    updateActiveApiKeys(Number(rows[0]?.count ?? '0'));

    const app = await buildServer();
    const port = env.AUTH_SERVICE_PORT;
    await app.listen({ port, host: '0.0.0.0' });
    app.log.info(`Auth service listening on ${port}`);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

void init();
