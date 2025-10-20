ALTER TABLE api_keys
ADD COLUMN IF NOT EXISTS api_key_plaintext TEXT;
