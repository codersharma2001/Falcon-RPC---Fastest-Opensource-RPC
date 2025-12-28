import { describe, expect, it } from 'vitest';
import { isRateLimit, normalizeBlockTag, shouldRetry, splitInclusiveRange } from '../src/openrpc';

describe('normalizeBlockTag', () => {
  it('handles hex and decimal', () => {
    expect(normalizeBlockTag('0x10')).toBe(16);
    expect(normalizeBlockTag('42')).toBe(42);
  });

  it('handles latest when provided', () => {
    expect(normalizeBlockTag('latest', 100)).toBe(100);
    expect(normalizeBlockTag('latest')).toBeNull();
  });
});

describe('splitInclusiveRange', () => {
  it('splits inclusive ranges', () => {
    const ranges = splitInclusiveRange(0, 9, 5);
    expect(ranges).toEqual([
      { from: 0, to: 4 },
      { from: 5, to: 9 }
    ]);
  });
});

describe('rate limit detection', () => {
  it('detects HTTP 429', () => {
    expect(isRateLimit({ response: { status: 429 } })).toBe(true);
  });

  it('detects textual hints', () => {
    expect(isRateLimit({ message: 'Rate limit exceeded' })).toBe(true);
  });
});

describe('shouldRetry', () => {
  it('retries on rate limit and 5xx', () => {
    expect(shouldRetry({ response: { status: 500 } })).toBe(true);
    expect(shouldRetry({ response: { status: 429 } })).toBe(true);
  });

  it('retries on timeouts', () => {
    expect(shouldRetry({ code: 'ECONNABORTED' })).toBe(true);
  });
});
