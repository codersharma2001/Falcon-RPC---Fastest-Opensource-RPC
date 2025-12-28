import Fastify, { type FastifyRequest } from 'fastify';
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
import { isRateLimit, normalizeBlockTag, shouldRetry, splitInclusiveRange } from './openrpc';

const httpClient = axios.create({
  baseURL: env.RPC_PROXY_TARGET,
  headers: { 'Content-Type': 'application/json' },
  timeout: 120_000
});

const semaphore = new Semaphore(env.RPC_PROXY_MAX_CONCURRENCY);

const TRACE_METHOD_REGEX = /^(debug_|trace_)/i;
const FINALITY_METHODS = new Set([
  'eth_getBalance',
  'eth_getCode',
  'eth_getStorageAt',
  'eth_getTransactionCount',
  'eth_call',
  'eth_getProof',
  'eth_getBlockTransactionCountByNumber',
  'eth_getTransactionByBlockNumberAndIndex'
]);

let fallbackIndex = 0;
let consensusHealth = { ok: false, checkedAt: 0 };

function nextFallbackEndpoint(): string | undefined {
  if (env.FALLBACK_RPC_ENDPOINTS.length === 0) return undefined;
  const endpoint = env.FALLBACK_RPC_ENDPOINTS[fallbackIndex % env.FALLBACK_RPC_ENDPOINTS.length];
  fallbackIndex = (fallbackIndex + 1) % env.FALLBACK_RPC_ENDPOINTS.length;
  return endpoint;
}

async function isConsensusHealthy(): Promise<boolean> {
  const now = Date.now();
  if (now - consensusHealth.checkedAt < 5000) {
    return consensusHealth.ok;
  }
  try {
    const response = await axios.get(env.CL_HEALTH_ENDPOINT, { timeout: 5_000 });
    const ok = response.data?.data?.is_syncing === false;
    consensusHealth = { ok, checkedAt: now };
    return ok;
  } catch (error) {
    consensusHealth = { ok: false, checkedAt: now };
    return false;
  }
}

function usesFinalityTag(method: string | undefined, payload: any): boolean {
  if (!method || !payload?.params) return false;
  const params = payload.params as any[];
  if (!Array.isArray(params)) return false;
  if (method === 'eth_getBlockByNumber') {
    const tag = params[0];
    return tag === 'finalized' || tag === 'safe';
  }
  if (FINALITY_METHODS.has(method)) {
    const tag = params[1];
    return tag === 'finalized' || tag === 'safe';
  }
  return false;
}

function requiresTraceFallback(requests: Array<{ method?: string }>): boolean {
  return requests.some(item => item.method !== undefined && TRACE_METHOD_REGEX.test(item.method));
}

function requiresFinalitySupport(requests: Array<{ method?: string; payload: any }>): boolean {
  return requests.some(item => usesFinalityTag(item.method, item.payload));
}

async function forwardJsonRpc(targetUrl: string, payload: unknown, request: FastifyRequest, timeoutMs = 120_000): Promise<any> {
  const headers = {
    'x-forwarded-for': request.ip,
    'user-agent': request.headers['user-agent']
  };

  if (targetUrl === env.RPC_PROXY_TARGET) {
    const response = await httpClient.post('/', payload, { headers, timeout: timeoutMs });
    return response.data;
  }
  const response = await axios.post(targetUrl, payload, {
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    timeout: timeoutMs
  });
  return response.data;
}

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

  const openRpcCandidate = env.OPENRPC_ENABLE && requests.length === 1 && requests[0].method === 'eth_getLogs';

  const needsTraceFallback = requiresTraceFallback(requests);
  const needsFinality = requiresFinalitySupport(requests);

  let targetUrl = env.RPC_PROXY_TARGET;
  if (needsTraceFallback) {
    const fallbackUrl = nextFallbackEndpoint();
    if (!fallbackUrl) {
      requestCounter.labels('unknown', planContext.plan.name, '503').inc();
      return reply.status(503).send({ error: 'Trace methods require a configured fallback RPC endpoint' });
    }
    server.log.warn({ fallbackUrl }, 'Routing trace request to fallback RPC endpoint');
    targetUrl = fallbackUrl;
  } else if (needsFinality) {
    const healthy = await isConsensusHealthy();
    if (!healthy) {
      if (env.FALLBACK_ON_FINALITY) {
        const fallbackUrl = nextFallbackEndpoint();
        if (!fallbackUrl) {
          requestCounter.labels('unknown', planContext.plan.name, '503').inc();
          return reply.status(503).send({ error: 'Finality temporarily unavailable and no fallback configured' });
        }
        server.log.warn({ fallbackUrl }, 'Consensus client unhealthy, routing finality request to fallback RPC endpoint');
        targetUrl = fallbackUrl;
      } else {
        requestCounter.labels('unknown', planContext.plan.name, '503').inc();
        return reply.status(503).send({ error: 'Finality temporarily unavailable' });
      }
    }
  }

  await semaphore.acquire();
  inFlightGauge.inc();
  try {
    const byteLength = Buffer.byteLength(JSON.stringify(payload));

    const openRpcResponse = openRpcCandidate
      ? await handleOpenRpcGetLogs(requests[0], request)
      : null;

    if (openRpcResponse?.error) {
      return reply.status(400).send(openRpcResponse.error);
    }

    const responsePayload = openRpcResponse?.response ?? await forwardJsonRpc(targetUrl, payload, request);
    const durationMs = Number((process.hrtime.bigint() - startNs) / BigInt(1_000_000));
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
    if (error?.message === 'OPENRPC_MAX_LOGS_EXCEEDED') {
      return reply.status(400).send({
        jsonrpc: '2.0',
        id: requests[0]?.id ?? null,
        error: {
          code: -32000,
          message: 'Result too large; reduce block range or add more filters; max logs in memory exceeded.'
        }
      });
    }
    if (error?.range) {
      return reply.status(503).send({
        jsonrpc: '2.0',
        id: requests[0]?.id ?? null,
        error: {
          code: -32000,
          message: `eth_getLogs chunk ${error.range.from}-${error.range.to} failed: ${error.cause?.message ?? 'upstream error'}. Try narrowing the range or adding filters.`
        }
      });
    }
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

interface ChunkResult {
  response?: any;
  error?: any;
}

async function handleOpenRpcGetLogs(
  reqItem: { id: string; payload: any },
  request: FastifyRequest
): Promise<ChunkResult | null> {
  const { payload } = reqItem;
  const filter = payload?.params?.[0];
  if (!filter || typeof filter !== 'object') return null;
  if (filter.blockHash !== undefined) return null; // do not chunk blockHash-based queries

  const fromTag = filter.fromBlock;
  const toTag = filter.toBlock;
  if (fromTag === undefined || toTag === undefined) return null;

  let latestNumber: number | undefined;
  if (String(toTag).toLowerCase() === 'latest') {
    latestNumber = await getLatestBlockNumber(request);
    if (latestNumber === null) {
      return {
        error: {
          jsonrpc: '2.0',
          id: payload.id ?? null,
          error: { code: -32000, message: 'Unable to resolve latest block for chunking' }
        }
      };
    }
  }

  const fromNum = normalizeBlockTag(fromTag, latestNumber);
  const toNum = normalizeBlockTag(toTag, latestNumber);
  if (fromNum === null || toNum === null || toNum < fromNum) {
    return null;
  }

  const userRange = toNum - fromNum;
  if (userRange > env.OPENRPC_MAX_USER_BLOCK_RANGE) {
    return {
      error: {
        jsonrpc: '2.0',
        id: payload.id ?? null,
        error: {
          code: -32000,
          message: `Block range ${userRange} exceeds Open RPC policy ${env.OPENRPC_MAX_USER_BLOCK_RANGE}`
        }
      }
    };
  }

  if (userRange <= env.UPSTREAM_MAX_LOG_RANGE) {
    return null; // no chunking needed
  }

  const ranges = splitInclusiveRange(fromNum, toNum, env.UPSTREAM_MAX_LOG_RANGE);
  const upstreams = buildUpstreamList();
  const limiter = createLimiter(env.UPSTREAM_MAX_PARALLEL);

  const results: Array<{ index: number; logs: any[] }> = [];
  let totalLogs = 0;

  await Promise.all(
    ranges.map((range, index) =>
      limiter(async () => {
        const logs = await fetchLogsRange(filter, range, upstreams, request);
        if (!Array.isArray(logs)) {
          throw new Error('Unexpected logs response');
        }
        totalLogs += logs.length;
        if (totalLogs > env.OPENRPC_MAX_LOGS_IN_MEMORY) {
          throw new Error('OPENRPC_MAX_LOGS_EXCEEDED');
        }
        results.push({ index, logs });
      })
    )
  );

  results.sort((a, b) => a.index - b.index);
  const combined = results.flatMap(item => item.logs);

  return {
    response: {
      jsonrpc: '2.0',
      id: payload.id ?? null,
      result: combined
    }
  };
}

async function fetchLogsRange(
  filter: any,
  range: { from: number; to: number },
  upstreams: string[],
  request: FastifyRequest
): Promise<any[]> {
  const requestBody = {
    jsonrpc: '2.0',
    id: `${range.from}-${range.to}-${Date.now()}`,
    method: 'eth_getLogs',
    params: [
      {
        ...filter,
        fromBlock: `0x${range.from.toString(16)}`,
        toBlock: `0x${range.to.toString(16)}`
      }
    ]
  };

  const maxRetries = 2;
  const baseDelay = 250;

  for (const upstream of upstreams) {
    let attempt = 0;
    while (attempt <= maxRetries) {
      try {
        const response = await forwardJsonRpc(upstream, requestBody, request, env.UPSTREAM_TIMEOUT_MS);
        if (response?.error) {
          if (isRateLimit(response)) {
            throw Object.assign(new Error('Rate limited'), { response });
          }
          throw buildChunkError(range, new Error(response.error?.message ?? 'Upstream error'));
        }
        return response?.result ?? [];
      } catch (error: any) {
        const retryable = shouldRetry(error);
        if (!retryable || attempt === maxRetries) {
          if (upstream !== upstreams[upstreams.length - 1] && retryable) {
            break; // move to next upstream
          }
          throw buildChunkError(range, error);
        }
        const delay = baseDelay * Math.pow(2, attempt) + Math.floor(Math.random() * 100);
        await wait(delay);
        attempt += 1;
      }
    }
  }

  throw buildChunkError(range, new Error('All upstreams failed'));
}

function buildChunkError(range: { from: number; to: number }, cause: any) {
  return Object.assign(new Error(`Chunk ${range.from}-${range.to} failed`), { cause, range });
}

async function getLatestBlockNumber(request: FastifyRequest): Promise<number | null> {
  const upstreams = buildUpstreamList();
  const body = { jsonrpc: '2.0', id: 'latest-block', method: 'eth_blockNumber', params: [] };
  for (const upstream of upstreams) {
    try {
      const result = await forwardJsonRpc(upstream, body, request, env.UPSTREAM_TIMEOUT_MS);
      const value = result?.result;
      const parsed = normalizeBlockTag(value);
      if (parsed !== null) return parsed;
    } catch (error) {
      server.log.warn({ err: error, upstream }, 'Failed to fetch latest block for Open RPC chunking');
    }
  }
  return null;
}

function buildUpstreamList(): string[] {
  return [env.RPC_PROXY_TARGET, ...env.FALLBACK_RPC_ENDPOINTS];
}

function createLimiter(limit: number) {
  let active = 0;
  const queue: Array<() => void> = [];

  const next = () => {
    active--;
    const fn = queue.shift();
    if (fn) fn();
  };

  return function<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const run = async () => {
        active++;
        try {
          const result = await fn();
          resolve(result);
        } catch (err) {
          reject(err);
        } finally {
          next();
        }
      };

      if (active < limit) {
        void run();
      } else {
        queue.push(run);
      }
    });
  };
}

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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
