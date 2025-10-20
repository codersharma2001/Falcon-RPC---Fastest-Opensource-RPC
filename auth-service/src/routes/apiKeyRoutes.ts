import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import ipaddr from 'ipaddr.js';
import { env } from '../env';
import { pool, withTransaction } from '../db';
import { createApiKey, listApiKeys, revokeApiKey, usageForKey, findApiKeyById } from '../repositories/apiKeyRepository';
import { generateApiKey, hashSecret } from '../security';
import { listPlans } from '../repositories/planRepository';
import { apiKeyCounter, updateActiveApiKeys, register } from '../metrics';
import { addAllowListEntry, deleteAllowListEntry, listAllowListEntries } from '../repositories/ipAllowListRepository';

const createSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  plan: z.enum(['free', 'dev', 'pro']).default('free'),
  rateLimitOverride: z.number().int().positive().optional(),
  blockRangeOverride: z.number().int().positive().optional(),
  apiKey: z.string().min(16).optional()
});

async function ensureAuthenticated(request: FastifyRequest, reply: FastifyReply): Promise<void | FastifyReply> {
  try {
    await request.jwtVerify();
  } catch (_err) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }
}

function ensureAdmin(request: FastifyRequest, reply: FastifyReply): boolean {
  if (request.user.role !== 'admin') {
    reply.status(403).send({ error: 'Forbidden' });
    return false;
  }
  return true;
}

function isValidCidr(value: string): boolean {
  try {
    ipaddr.parseCIDR(value);
    return true;
  } catch (_err) {
    return false;
  }
}

export async function apiKeyRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/plans', { preHandler: ensureAuthenticated }, async (_request, reply) => {
    const plans = await listPlans();
    return reply.send(plans);
  });

  fastify.get('/api/keys', { preHandler: ensureAuthenticated }, async (request, reply) => {
    if (!ensureAdmin(request, reply)) return;
    const keys = await listApiKeys();
    return reply.send(
      keys.map(key => ({
        id: key.id,
        user_id: key.user_id,
        name: key.name,
        plan: key.plan,
        rate_limit_override: key.rate_limit_override,
        block_range_override: key.block_range_override,
        revoked_at: key.revoked_at,
        last_used_at: key.last_used_at,
        created_at: key.created_at
      }))
    );
  });

  fastify.post('/api/keys', { preHandler: ensureAuthenticated }, async (request, reply) => {
    if (!ensureAdmin(request, reply)) return;

    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid payload' });
    }

    const data = parsed.data;
    const rawKey = data.apiKey ?? generateApiKey();
    const keyHash = await hashSecret(rawKey);

    const record = await withTransaction(async client => {
      return await createApiKey(client, {
        plan: data.plan,
        name: data.name,
        apiKeyHash: keyHash,
        apiKeyPlaintext: rawKey,
        rateLimitOverride: data.rateLimitOverride,
        blockRangeOverride: data.blockRangeOverride
      });
    });

    fastify.log.info({ apiKeyId: record.id, plan: record.plan }, 'Created API key');
    apiKeyCounter.inc();
    const { rows } = await pool.query<{ count: string }>(
      'SELECT COUNT(*)::text as count FROM api_keys WHERE revoked_at IS NULL'
    );
    updateActiveApiKeys(Number(rows[0]?.count ?? '0'));

    return reply.status(201).send({
      id: record.id,
      apiKey: rawKey,
      plan: record.plan,
      name: record.name,
      createdAt: record.created_at
    });
  });

  fastify.get('/api/keys/:id/secret', { preHandler: ensureAuthenticated }, async (request, reply) => {
    if (!ensureAdmin(request, reply)) return;

    const paramsSchema = z.object({ id: z.string().uuid() });
    const parsed = paramsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid key id' });
    }

    const key = await findApiKeyById(parsed.data.id);
    if (!key) {
      return reply.status(404).send({ error: 'Key not found' });
    }

    return reply.send({
      id: key.id,
      name: key.name,
      apiKey: key.api_key_plaintext
    });
  });

  fastify.delete('/api/keys/:id', { preHandler: ensureAuthenticated }, async (request, reply) => {
    if (!ensureAdmin(request, reply)) return;

    const paramsSchema = z.object({ id: z.string().uuid() });
    const parsed = paramsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid key id' });
    }

    await revokeApiKey(parsed.data.id);
    const { rows } = await pool.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM api_keys WHERE revoked_at IS NULL'
    );
    updateActiveApiKeys(Number(rows[0]?.count ?? '0'));
    return reply.status(204).send();
  });

  fastify.get('/api/usage/:id', { preHandler: ensureAuthenticated }, async (request, reply) => {
    if (!ensureAdmin(request, reply)) return;

    const paramsSchema = z.object({ id: z.string().uuid() });
    const parsed = paramsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid key id' });
    }

    const usage = await usageForKey(parsed.data.id);
    return reply.send({ usage });
  });

  fastify.get('/api/keys/:id/allowlist', { preHandler: ensureAuthenticated }, async (request, reply) => {
    if (!ensureAdmin(request, reply)) return;

    const paramsSchema = z.object({ id: z.string().uuid() });
    const parsed = paramsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid key id' });
    }

    const entries = await listAllowListEntries(parsed.data.id);
    return reply.send({ entries });
  });

  fastify.post('/api/keys/:id/allowlist', { preHandler: ensureAuthenticated }, async (request, reply) => {
    if (!ensureAdmin(request, reply)) return;

    const paramsSchema = z.object({ id: z.string().uuid() });
    const bodySchema = z.object({ cidr: z.string().min(3) });

    const params = paramsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: 'Invalid key id' });
    }

    const body = bodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: 'Invalid CIDR' });
    }

    if (!isValidCidr(body.data.cidr)) {
      return reply.status(400).send({ error: 'Malformed CIDR block' });
    }

    const entry = await addAllowListEntry(params.data.id, body.data.cidr);
    return reply.status(201).send({ entry });
  });

  fastify.delete('/api/allowlist/:entryId', { preHandler: ensureAuthenticated }, async (request, reply) => {
    if (!ensureAdmin(request, reply)) return;

    const paramsSchema = z.object({ entryId: z.coerce.number().int().positive() });
    const parsed = paramsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid entry id' });
    }

    await deleteAllowListEntry(parsed.data.entryId);
    return reply.status(204).send();
  });

  fastify.get('/metrics', async (_request, reply) => {
    reply.header('Content-Type', register.contentType);
    return reply.send(await register.metrics());
  });

  fastify.get('/health', async (_request, reply) => {
    try {
      await pool.query('SELECT 1');
      return reply.send({ status: 'ok', adminEmail: env.ADMIN_EMAIL });
    } catch (error) {
      fastify.log.error({ err: error }, 'Health check failed');
      return reply.status(500).send({ status: 'error' });
    }
  });
}
