import { describe, expect, it } from 'vitest';
import { computeBilling } from '../src/billingCalculator';

describe('computeBilling', () => {
  it('applies quota and pricing correctly', () => {
    const result = computeBilling(6000, 5000, 0.01);
    expect(result.included).toBe(5000);
    expect(result.overage).toBe(1000);
    expect(result.amount).toBeCloseTo(0.01);
  });

  it('treats pro plan as unlimited', () => {
    const result = computeBilling(20000, 0, 0.005);
    expect(result.included).toBe(0);
    expect(result.overage).toBe(20000);
    expect(result.amount).toBeCloseTo(0.1);
  });
});
