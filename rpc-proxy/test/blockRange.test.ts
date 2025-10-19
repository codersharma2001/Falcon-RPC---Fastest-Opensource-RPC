import { describe, expect, it } from 'vitest';
import { parseBlockRange } from '../src/blockRange';

describe('parseBlockRange', () => {
  it('returns block range for numeric hex values', () => {
    const result = parseBlockRange({
      params: [
        {
          fromBlock: '0x10',
          toBlock: '0x20'
        }
      ]
    });
    expect(result.blockRange).toBe(0x20 - 0x10);
  });

  it('returns null when blocks are not computable', () => {
    const result = parseBlockRange({
      params: [
        {
          fromBlock: 'latest',
          toBlock: 'latest'
        }
      ]
    });
    expect(result.blockRange).toBeNull();
  });
});
