import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { env } from './env';
import { pool } from './db';
import { runBillingCycle } from './billingCalculator';
import { register } from './metrics';

const server = Fastify({
  logger: {
    level: env.LOG_LEVEL
  }
});

server.get('/health', async (_request: FastifyRequest, reply: FastifyReply) => {
  try {
    await pool.query('SELECT 1');
    return reply.send({ status: 'ok' });
  } catch (error) {
    server.log.error({ err: error }, 'Health check failed');
    return reply.status(500).send({ status: 'error' });
  }
});

server.get('/metrics', async (_request: FastifyRequest, reply: FastifyReply) => {
  reply.header('Content-Type', register.contentType);
  return reply.send(await register.metrics());
});

async function scheduleBilling() {
  try {
    await runBillingCycle();
    server.log.info('Billing cycle completed');
  } catch (error) {
    server.log.error({ err: error }, 'Billing cycle failed');
  }
}

async function start() {
  await scheduleBilling();
  setInterval(scheduleBilling, env.BILLING_CRON_INTERVAL_SECONDS * 1000);

  try {
    await server.listen({ port: env.BILLING_ENGINE_PORT, host: '0.0.0.0' });
    server.log.info(`Billing engine listening on ${env.BILLING_ENGINE_PORT}`);
  } catch (error) {
    server.log.error({ err: error }, 'Failed to start billing engine');
    process.exit(1);
  }
}

void start();
