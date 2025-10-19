import { Counter, Gauge, Registry } from 'prom-client';

export const register = new Registry();

export const apiKeyCounter = new Counter({
  name: 'auth_service_api_keys_total',
  help: 'Total number of API keys created',
  registers: [register]
});

export const activeApiKeysGauge = new Gauge({
  name: 'auth_service_active_api_keys',
  help: 'Active API keys',
  registers: [register]
});

export function updateActiveApiKeys(count: number): void {
  activeApiKeysGauge.set(count);
}
