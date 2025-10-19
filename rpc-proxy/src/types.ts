export interface ApiKeyRecord {
  id: string;
  plan: string;
  rate_limit_override: number | null;
  block_range_override: number | null;
  revoked_at: Date | null;
  last_used_at: Date | null;
}

export interface PlanRecord {
  name: string;
  rate_limit_per_minute: number;
  max_block_range: number;
  monthly_quota: number;
  price_per_1k: number;
}

export interface PlanContext {
  apiKeyId: string;
  plan: PlanRecord;
  rateLimit: number;
  maxBlockRange: number;
}
