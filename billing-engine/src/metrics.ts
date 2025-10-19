import { Counter, Gauge, Registry } from 'prom-client';

export const register = new Registry();

export const billingRuns = new Counter({
  name: 'billing_engine_runs_total',
  help: 'Total completed billing runs',
  registers: [register]
});

export const billingErrors = new Counter({
  name: 'billing_engine_errors_total',
  help: 'Billing run errors',
  registers: [register]
});

export const outstandingAmount = new Gauge({
  name: 'billing_engine_outstanding_amount',
  help: 'Total outstanding amount this period',
  registers: [register],
  labelNames: ['currency']
});
