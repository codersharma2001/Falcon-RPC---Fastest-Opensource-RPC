import Fastify from 'fastify';
import axios from 'axios';
import WebSocket, { WebSocketServer } from 'ws';
import { env } from './env';
import { resolveApiKey, touchApiKey } from './apiKeyService';
import { enforceRateLimit, RateLimitError } from './rateLimit';
import { recordMetricSample, recordUsage } from './usageLogger';
import { parseBlockRange } from './blockRange';
import {
  requestCounter,
  requestDuration,
  inFlightGauge,
  blockRangeHistogram,
  register,
  websocketConnections
} from './metrics';
import { pool } from './db';
import { Semaphore } from './semaphore';
import { isIpAllowed } from './ipAllowList';

const httpClient = axios.create({
  baseURL: env.RPC_PROXY_TARGET,
  headers: { 'Content-Type': 'application/json' },
  timeout: 120_000
});

const semaphore = new Semaphore(env.RPC_PROXY_MAX_CONCURRENCY);

const server = Fastify({
  logger: {
    level: env.LOG_LEVEL
  },
  bodyLimit: 5 * 1024 * 1024
});

server.post('/', async (request, reply) => {
  const startNs = process.hrtime.bigint();
  const apiKeyHeader = request.headers['x-api-key'];
  if (!apiKeyHeader || Array.isArray(apiKeyHeader)) {
    return reply.status(401).send({ error: 'Missing API key' });
  }

  const planContext = await resolveApiKey(apiKeyHeader);
  if (!planContext) {
    return reply.status(401).send({ error: 'Invalid API key' });
  }

  const clientIp = request.ip;
  const allowed = await isIpAllowed(planContext.apiKeyId, clientIp);
  if (!allowed) {
    return reply.status(403).send({ error: 'IP not allowed' });
  }

  try {
    await enforceRateLimit(planContext.apiKeyId, planContext.rateLimit);
  } catch (error) {
    if (error instanceof RateLimitError) {
      requestCounter.labels('unknown', planContext.plan.name, '429').inc();
      return reply.status(429).send({ error: error.message });
    }
    throw error;
  }

  const payload = request.body as unknown;
  const requests = normalizePayload(payload);
  if (requests.length === 0) {
    return reply.status(400).send({ error: 'Invalid JSON-RPC payload' });
  }

  for (const item of requests) {
    if (!item.method) continue;
    if (item.method === 'eth_getLogs' || item.method === 'trace_filter') {
      const range = parseBlockRange(item.payload);
      if (range.blockRange !== null && planContext.maxBlockRange > 0 && range.blockRange > planContext.maxBlockRange) {
        return reply.status(400).send({
          error: `Block range ${range.blockRange} exceeds plan allowance ${planContext.maxBlockRange}`
        });
      }
      if (range.blockRange !== null) {
        blockRangeHistogram.observe(range.blockRange);
      }
    }
  }

  await semaphore.acquire();
  inFlightGauge.inc();
  try {
    const byteLength = Buffer.byteLength(JSON.stringify(payload));
    const response = await httpClient.post('/', payload, {
      headers: {
        'x-forwarded-for': request.ip,
        'user-agent': request.headers['user-agent']
      }
    });

    const durationMs = Number((process.hrtime.bigint() - startNs) / BigInt(1_000_000));
    const responsePayload = response.data;
    const responses = normalizeResponses(responsePayload);

    await touchApiKey(planContext.apiKeyId);

    await Promise.all(requests.map(async reqItem => {
      const res = responses.get(reqItem.id);
      const success = res ? res.error === undefined : true;
      const errorCode = res && res.error ? String(res.error.code ?? 'unknown') : null;
      requestCounter.labels(reqItem.method ?? 'unknown', planContext.plan.name, success ? '200' : 'error').inc();
      requestDuration.labels(reqItem.method ?? 'unknown', planContext.plan.name).observe(durationMs);
      await recordMetricSample(planContext.apiKeyId, reqItem.method ?? 'unknown', durationMs, success);
      await recordUsage({
        apiKeyId: planContext.apiKeyId,
        method: reqItem.method ?? 'unknown',
        byteCount: byteLength,
        blockRange: reqItem.method === 'eth_getLogs' ? parseBlockRange(reqItem.payload).blockRange ?? null : null,
        success,
        errorCode
      });
    }));

    return reply.send(responsePayload);
  } catch (error: any) {
    server.log.error({ err: error }, 'RPC forwarding failed');
    requestCounter.labels('unknown', planContext.plan.name, 'error').inc();
    if (error.response) {
      return reply.status(error.response.status ?? 502).send(error.response.data);
    }
    return reply.status(502).send({ error: 'Upstream error' });
  } finally {
    inFlightGauge.dec();
    semaphore.release();
  }
});

server.get('/metrics', async (_request, reply) => {
  reply.header('Content-Type', register.contentType);
  return reply.send(await register.metrics());
});

server.get('/health', async (_request, reply) => {
  try {
    await pool.query('SELECT 1');
    return reply.send({ status: 'ok' });
  } catch (error) {
    server.log.error({ err: error }, 'Health check failed');
    return reply.status(500).send({ status: 'error' });
  }
});

function normalizePayload(payload: unknown): Array<{ id: string; method?: string; payload: any }> {
  if (!payload) return [];
  if (Array.isArray(payload)) {
    return payload.map(item => ({
      id: String(item?.id ?? `${Date.now()}-${Math.random()}`),
      method: item?.method,
      payload: item
    }));
  }
  const single = payload as any;
  return [{
    id: String(single?.id ?? `${Date.now()}-${Math.random()}`),
    method: single?.method,
    payload: single
  }];
}

function normalizeResponses(response: any): Map<string, any> {
  const map = new Map<string, any>();
  if (Array.isArray(response)) {
    for (const item of response) {
      if (item && item.id !== undefined) {
        map.set(String(item.id), item);
      }
    }
  } else if (response && response.id !== undefined) {
    map.set(String(response.id), response);
  }
  return map;
}

async function start() {
  try {
    await server.listen({ port: env.RPC_PROXY_PORT, host: '0.0.0.0' });
    server.log.info(`RPC proxy running on port ${env.RPC_PROXY_PORT}`);

    const wss = new WebSocketServer({ port: env.RPC_PROXY_WS_PORT });

    wss.on('connection', async (socket, req) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const headerKey = req.headers['x-api-key'];
      const apiKey = (Array.isArray(headerKey) ? headerKey[0] : headerKey) ?? url.searchParams.get('apiKey');
      if (!apiKey) {
        socket.close(4001, 'Missing API key');
        return;
      }

      const context = await resolveApiKey(apiKey);
      if (!context) {
        socket.close(4001, 'Invalid API key');
        return;
      }

      const remoteAddress = req.socket.remoteAddress ?? '';
      const allowed = await isIpAllowed(context.apiKeyId, remoteAddress);
      if (!allowed) {
        socket.close(4003, 'IP not allowed');
        return;
      }

      websocketConnections.inc();
      void touchApiKey(context.apiKeyId);
      const upstream = new WebSocket(env.RPC_PROXY_WS_TARGET, {
        headers: { 'x-api-key': apiKey }
      });

      upstream.on('open', () => {
        socket.on('message', message => {
          upstream.send(message);
        });
        upstream.on('message', data => {
          socket.send(data);
        });
      });

      let closed = false;
      const cleanup = () => {
        if (closed) return;
        closed = true;
        websocketConnections.dec();
        try { upstream.close(); } catch (_) {}
        if (socket.readyState === WebSocket.OPEN) {
          try { socket.close(); } catch (_) {}
        }
      };

      upstream.on('close', cleanup);
      upstream.on('error', err => {
        server.log.error({ err }, 'Upstream websocket error');
        cleanup();
      });

      socket.on('close', cleanup);
      socket.on('error', err => {
        server.log.error({ err }, 'Client websocket error');
        cleanup();
      });
    });

    wss.on('listening', () => {
      server.log.info(`WebSocket proxy listening on port ${env.RPC_PROXY_WS_PORT}`);
    });

    const shutdown = async () => {
      await server.close();
      await pool.end();
      wss.close();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (err) {
    server.log.error({ err }, 'Failed to start server');
    process.exit(1);
  }
}

void start();
