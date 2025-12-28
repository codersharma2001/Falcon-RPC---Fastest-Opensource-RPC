export function normalizeBlockTag(tag: any, latestNumber?: number): number | null {
  if (tag === undefined || tag === null) return null;
  if (typeof tag === 'number') return tag;
  if (typeof tag === 'string') {
    const lowered = tag.toLowerCase();
    if (lowered === 'latest') {
      return latestNumber !== undefined ? latestNumber : null;
    }
    if (lowered.startsWith('0x')) {
      const parsed = parseInt(lowered, 16);
      return Number.isNaN(parsed) ? null : parsed;
    }
    const parsed = Number(tag);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

export function splitInclusiveRange(from: number, to: number, step: number): Array<{ from: number; to: number }> {
  const ranges: Array<{ from: number; to: number }> = [];
  if (step <= 0) return ranges;
  for (let start = from; start <= to; start += step) {
    const end = Math.min(start + step - 1, to);
    ranges.push({ from: start, to: end });
    if (end === to) break;
  }
  return ranges;
}

export function isRateLimit(err: any): boolean {
  const status = err?.response?.status;
  if (status === 429) return true;
  const message = String(err?.response?.data?.error?.message ?? err?.message ?? '').toLowerCase();
  return message.includes('rate limit') || message.includes('too many request') || message.includes('throttle') || message.includes('exceed');
}

export function shouldRetry(err: any): boolean {
  if (isRateLimit(err)) return true;
  const status = err?.response?.status;
  if (typeof status === 'number' && status >= 500) return true;
  const code = err?.code;
  return code === 'ECONNABORTED' || code === 'ETIMEDOUT' || code === 'ECONNRESET';
}
