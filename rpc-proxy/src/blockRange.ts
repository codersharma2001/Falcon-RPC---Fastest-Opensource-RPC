interface RangeResult {
  blockRange: number | null;
  fromBlock?: string;
  toBlock?: string;
}

export function parseBlockRange(payload: any): RangeResult {
  if (!payload || !payload.params) {
    return { blockRange: null };
  }
  const params = payload.params;
  if (!Array.isArray(params) || params.length === 0) {
    return { blockRange: null };
  }
  const filter = params[0];
  if (!filter || typeof filter !== 'object') {
    return { blockRange: null };
  }
  const from = filter.fromBlock;
  const to = filter.toBlock;
  if ((typeof from !== 'string' && from !== undefined) || (typeof to !== 'string' && to !== undefined)) {
    return { blockRange: null };
  }

  const fromNum = hexBlockToNumber(from ?? '0x0');
  const toNum = hexBlockToNumber(to ?? 'latest');
  if (fromNum === null || toNum === null || toNum < fromNum) {
    return { blockRange: null };
  }
  return {
    blockRange: toNum - fromNum,
    fromBlock: from,
    toBlock: to
  };
}

function hexBlockToNumber(value: string): number | null {
  if (value === 'latest' || value === 'pending' || value === 'safe' || value === 'finalized') {
    return null; // cannot infer, treat as unlimited
  }
  if (!value.startsWith('0x')) {
    return Number(value);
  }
  try {
    return parseInt(value, 16);
  } catch (_err) {
    return null;
  }
}
