# API Documentation

## Auth Service (`http://localhost:8080`)

### POST `/api/login`
Authenticate admin users and retrieve a JWT.

```json
{
  "email": "admin@example.com",
  "password": "change_me"
}
```

Response:
```json
{ "token": "<jwt>" }
```

### GET `/api/plans`
Return all available billing plans. Requires `Authorization: Bearer <token>`.

### GET `/api/keys`
List API keys (admin only). Response includes metadata but never the plain secret.

### POST `/api/keys`
Create a new API key.

Request body:
```json
{
  "name": "My dApp",
  "plan": "dev",
  "rateLimitOverride": 150,
  "blockRangeOverride": 2000
}
```

Response contains the generated secret once:
```json
{
  "id": "uuid",
  "apiKey": "8a05...",
  "plan": "dev",
  "name": "My dApp",
  "createdAt": "2024-05-05T12:00:00.000Z"
}
```

### DELETE `/api/keys/:id`
Soft-revoke a key (sets `revoked_at`).

### GET `/api/usage/:id`
Aggregate usage for a key grouped by method.

### GET `/api/usage/:id/daily`
Daily request totals (30-day window) for charts.

### GET `/api/usage/:id/top-methods`
Top RPC methods by call volume.

### GET `/api/usage/aggregate`
Summed usage per plan.

### GET `/api/keys/:id/allowlist`
List CIDR allowlist entries for a key.

### POST `/api/keys/:id/allowlist`
Add a CIDR block (e.g. `10.0.0.0/16`).

### DELETE `/api/allowlist/:entryId`
Remove allowlist entry by numeric ID.

### GET `/api/billing`
Current billing period records for every key.

### GET `/api/billing/:id`
Billing history for a specific key.

### GET `/metrics`
Prometheus metrics (`Content-Type: text/plain`). No auth required.

### GET `/health`
Basic readiness probe.

---

## RPC Proxy (`http://localhost:8545` / `ws://localhost:8546`)

All requests must include `x-api-key: <api key>`.

### JSON-RPC POST `/`
Forwards JSON-RPC requests to Erigon.

- Enforces per-plan rate limits.
- Applies block range ceilings to `eth_getLogs` and `trace_filter`.
- Records usage and latency metrics.

Example request:
```json
{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}
```

### WebSocket `ws://localhost:8546`
Start a subscription by connecting to `/` (default path) and providing the API key as either header (`x-api-key`) or query (`?apiKey=`).

### GET `/metrics`
Prometheus metrics for the proxy.

### GET `/health`
Connectivity and database check.

---

## Billing Engine (`http://localhost:8090`)

### GET `/metrics`
Prometheus metrics with billing totals.

### GET `/health`
Database connectivity check.

> Business logic runs on an interval; there are no public billing REST endpoints. The auth service exposes billing information directly from PostgreSQL.
