import { Counter, Gauge, Histogram, Registry } from 'prom-client';

export const register = new Registry();

export const requestCounter = new Counter({
  name: 'rpc_proxy_requests_total',
  help: 'Total JSON-RPC requests processed',
  registers: [register],
  labelNames: ['method', 'plan', 'status']
});

export const requestDuration = new Histogram({
  name: 'rpc_proxy_request_duration_ms',
  help: 'JSON-RPC duration in ms',
  registers: [register],
  labelNames: ['method', 'plan'],
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000]
});

export const inFlightGauge = new Gauge({
  name: 'rpc_proxy_inflight_requests',
  help: 'In-flight RPC requests',
  registers: [register]
});

export const blockRangeHistogram = new Histogram({
  name: 'rpc_proxy_block_range',
  help: 'Requested block range for eth_getLogs',
  registers: [register],
  buckets: [1, 10, 100, 1000, 10_000, 100_000, 1_000_000]
});

export const websocketConnections = new Gauge({
  name: 'rpc_proxy_websocket_connections',
  help: 'Active websocket connections',
  registers: [register]
});
