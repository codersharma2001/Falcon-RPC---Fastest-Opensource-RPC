import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getDailyUsage, getTopMethods, getAggregateUsage } from '../repositories/usageRepository';
import { getBillingForKey, getCurrentPeriodBilling } from '../repositories/billingRepository';

export async function dashboardRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch (_err) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
    if (request.user.role !== 'admin') {
      return reply.status(403).send({ error: 'Forbidden' });
    }
  });

  fastify.get('/api/usage/:id/daily', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const parsed = paramsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid key id' });
    }
    const data = await getDailyUsage(parsed.data.id);
    return reply.send({ data });
  });

  fastify.get('/api/usage/:id/top-methods', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const parsed = paramsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid key id' });
    }
    const data = await getTopMethods(parsed.data.id);
    return reply.send({ data });
  });

  fastify.get('/api/usage/aggregate', async (_request, reply) => {
    const data = await getAggregateUsage();
    return reply.send({ data });
  });

  fastify.get('/api/billing/:id', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const parsed = paramsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid key id' });
    }
    const data = await getBillingForKey(parsed.data.id);
    return reply.send({ data });
  });

  fastify.get('/api/billing', async (_request, reply) => {
    const data = await getCurrentPeriodBilling();
    return reply.send({ data });
  });
}
