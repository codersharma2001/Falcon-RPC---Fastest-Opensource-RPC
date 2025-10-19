CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS plans (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    rate_limit_per_minute INTEGER NOT NULL,
    max_block_range BIGINT NOT NULL,
    monthly_quota INTEGER NOT NULL,
    price_per_1k NUMERIC(10,4) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO plans (name, rate_limit_per_minute, max_block_range, monthly_quota, price_per_1k)
VALUES
    ('free', 10, 10, 5000, 0.0000),
    ('dev', 100, 1000, 50000, 0.0100),
    ('pro', 500, 1000000, 0, 0.0050)
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name TEXT,
    plan TEXT NOT NULL REFERENCES plans(name),
    api_key_hash TEXT NOT NULL,
    rate_limit_override INTEGER,
    block_range_override BIGINT,
    revoked_at TIMESTAMP WITH TIME ZONE,
    last_used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_plan ON api_keys(plan);

CREATE TABLE IF NOT EXISTS usage_logs (
    id BIGSERIAL PRIMARY KEY,
    api_key_id UUID REFERENCES api_keys(id) ON DELETE CASCADE,
    method TEXT NOT NULL,
    request_count INTEGER NOT NULL,
    byte_count BIGINT NOT NULL,
    block_range BIGINT,
    success BOOLEAN DEFAULT TRUE,
    error_code TEXT,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_logs_api_key_id ON usage_logs(api_key_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_recorded_at ON usage_logs(recorded_at);

CREATE TABLE IF NOT EXISTS billing_records (
    id BIGSERIAL PRIMARY KEY,
    api_key_id UUID REFERENCES api_keys(id) ON DELETE CASCADE,
    plan TEXT NOT NULL,
    billing_period_start DATE NOT NULL,
    billing_period_end DATE NOT NULL,
    total_requests BIGINT NOT NULL,
    included_requests BIGINT NOT NULL,
    overage_requests BIGINT NOT NULL,
    amount_due NUMERIC(12,4) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_unique_period ON billing_records(api_key_id, billing_period_start, billing_period_end);

CREATE TABLE IF NOT EXISTS rate_limit_counters (
    api_key_id UUID PRIMARY KEY REFERENCES api_keys(id) ON DELETE CASCADE,
    window_start TIMESTAMP WITH TIME ZONE NOT NULL,
    request_count INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ip_allow_list (
    id SERIAL PRIMARY KEY,
    api_key_id UUID REFERENCES api_keys(id) ON DELETE CASCADE,
    cidr TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS node_metrics (
    id BIGSERIAL PRIMARY KEY,
    api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,
    method TEXT NOT NULL,
    duration_ms INTEGER NOT NULL,
    success BOOLEAN DEFAULT TRUE,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_node_metrics_method ON node_metrics(method);
CREATE INDEX IF NOT EXISTS idx_node_metrics_recorded_at ON node_metrics(recorded_at);
