# Falcon-RPC---Fastest-RPC

Falcon-RPC---Fastest-RPC is a batteries-included, self-hostable RPC platform that combines an Ethereum Erigon node, authenticated proxying, API key governance, metered billing, observability, and a web dashboard. Spin it up with Docker Compose and you have everything you need to operate production-grade infrastructure without relying on third-party providers.

## Features at a Glance
- **High-throughput RPC proxy** with per-plan rate limits, block range enforcement, websocket support, and detailed logging.
- **API key and identity service** offering JWT-secured admin APIs, plan management, CIDR allowlists, and Prometheus metrics.
- **Consensus-backed execution** courtesy of Lighthouse, enabling finalized/safe block tags without relying on external providers.
- **Billing engine** that turns usage logs into simulated invoices and real-time revenue gauges.
- **Next.js dashboard** for issuing keys, tracking usage, and reviewing billing performance.
- **Observability stack** (Prometheus + Grafana) provisioned with dashboards for latency, throughput, and billing KPIs.
- **One-command deployment** through `docker compose`, backed by a PostgreSQL schema tuned for usage analytics.

## Component Matrix
| Service | Directory | Default Port(s) | What it does |
|---------|-----------|-----------------|---------------|
| `postgres` | `db` | `5432` (mapped from `${POSTGRES_PORT}`) | Stores users, plans, API keys, rate-limit counters, usage logs, billing records, and allowlists. |
| `auth-service` | `auth-service` | `8080` | Fastify service that handles admin login, API key CRUD, usage aggregation, billing queries, and exposes metrics. |
| `rpc-proxy` | `rpc-proxy` | `8545` (HTTP), `8546` (WS) | Authenticated JSON-RPC forwarder with rate limiting, block-range ceilings, metrics, and request accounting. |
| `billing-engine` | `billing-engine` | `8090` | Background worker + Fastify health/metrics endpoints that compute simulated invoices at a configurable cadence. |
| `dashboard` | `dashboard` | `3000` | Next.js app for operators to manage keys, visualize usage, and inspect billing data. |
| `erigon` | external image | `8545`, `8546`, `6060` | Execution client providing archive-grade Ethereum data to the proxy and exporting node metrics. |
| `lighthouse` | external image | `5052`, `5054` | Consensus client feeds finality information to Erigon and exposes REST + metrics interfaces. |
| `prometheus` | `prometheus` | `9090` | Scrapes metrics from every service and Erigon. |
| `grafana` | `grafana` | `3001` | Pre-provisioned dashboards for RPC throughput, latency, billing totals, and node health. |

## Quickstart
Ensure Docker Compose is available, then:

```bash
git clone https://github.com/your-org/falcon-rpc.git
cd falcon-rpc
cp .env.example .env  # if you have not created one yet
docker compose up -d --build

# optional: follow logs
docker compose logs -f auth-service rpc-proxy billing-engine lighthouse erigon
```

Default endpoints once the stack is healthy:

| Service | URL |
|---------|-----|
| RPC Proxy (HTTP) | `http://localhost:8545` |
| RPC Proxy (WebSocket) | `ws://localhost:8546` |
| Auth API | `http://localhost:8080` |
| Dashboard | `http://localhost:3000` |
| Lighthouse REST | `http://localhost:5052` |
| Lighthouse Metrics | `http://localhost:5054/metrics` |
| Prometheus | `http://localhost:9090` |
| Grafana | `http://localhost:3001` |

Grafana boots with `admin` / `admin` (configure via `GRAFANA_ADMIN_*`).  
> **Heads-up:** Erigon + Lighthouse perform a full mainnet sync. Expect significant disk usage (>= 1.5 TB) and time on first boot. You can swap either client for a lighter backend or point at remote RPC/CL endpoints if desired.

The execution/consensus JWT secret lives in `config/jwt/engine.jwt`. Rotate it before production use and keep both containers in sync if you change the path.

### First Request Walkthrough
1. Sign in to the dashboard with `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env`.
2. Create a new API key or reuse the seeded `ADMIN_DEFAULT_API_KEY`.
3. Call the proxy:

```bash
curl -X POST http://localhost:8545 \
  -H 'Content-Type: application/json' \
  -H 'x-api-key: local-admin-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}'
```

4. Inspect live metrics in Grafana and usage charts on the dashboard to verify the request was recorded.

## Architecture
```
                          ┌──────────────────────┐
                          │    Dashboard (Next)  │
                          └──────────┬───────────┘
                                     │
┌──────────────┐         ┌───────────▼───────────┐        ┌──────────────┐
│  User / dApp │  RPC    │    RPC Proxy (Fastify) ├───────►│   Erigon     │
└───────┬──────┘  calls  └───────────┬───────────┘        └──────┬───────┘
        │                            │                           │
        │                            │ writes usage / queries    │ engine API / auth RPC
        │                            ▼                           │
        │                ┌──────────────────────┐                │
        │                │   PostgreSQL (DB)    │                │
        │                └──────────┬───────────┘                │
        │                            │                           │
        │          ┌────────────────▼─────────────┐              │
        │          │   Auth Service (Fastify)     │              │
        │          └──────────┬───────────┬───────┘              │
        │                     │           │                      │
        │                     │           │ billing summaries    │
        │                     │           ▼                      │
        │                     │   ┌───────────────┐              │
        │                     └──►│ Billing Engine│              │
        │                         └───────────────┘              │
        │                                                        │
        ▼                                                        ▼
┌──────────────────┐        ┌───────────────────┐      ┌──────────────────┐
│ Prometheus (9090)│◄───────┤ Metrics exporters │      │ Lighthouse (CL)  │
└──────────────────┘        └───────────────────┘      └──────────┬───────┘
          │                                               finality │
          ▼                                                        │ checkpoint sync
┌──────────────────┐                                              │
│ Grafana (3001)   │◄─────────────────────────────────────────────┘
└──────────────────┘
```

## Configuration Reference
All services read environment variables from `.env`. Key settings:

| Section | Variables | Notes |
|---------|-----------|-------|
| PostgreSQL | `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT`, `POSTGRES_HOST` | Credentials used by every service; defaults target the bundled TimescaleDB image. |
| Auth Service | `AUTH_SERVICE_PORT`, `AUTH_JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_DEFAULT_PLAN`, `ADMIN_DEFAULT_API_KEY` | Set a strong JWT secret and rotate seeded admin credentials before production. |
| RPC Proxy | `RPC_PROXY_PORT`, `RPC_PROXY_WS_PORT`, `RPC_PROXY_TARGET`, `RPC_PROXY_WS_TARGET`, `RPC_PROXY_RATE_LIMIT_WINDOW`, `RPC_PROXY_MAX_CONCURRENCY`, `RPC_PROXY_MAX_BLOCK_RANGE_*` | Target URLs point to Erigon by default; block range ceilings are enforced per plan. |
| Billing | `BILLING_ENGINE_PORT`, `BILLING_CRON_INTERVAL_SECONDS` | Controls Fastify port and how often invoices are recomputed. |
| Dashboard | `DASHBOARD_PORT`, `NEXT_PUBLIC_*` | Public endpoints used by the Next.js app; adjust if accessing from outside Docker. |
| Grafana | `GRAFANA_ADMIN_USER`, `GRAFANA_ADMIN_PASSWORD` | Overrides the default credentials. |
| Consensus | `ERIGON_AUTHRPC_PORT`, `LIGHTHOUSE_HTTP_PORT`, `LIGHTHOUSE_METRICS_PORT`, `LIGHTHOUSE_CHECKPOINT_URL`, `LIGHTHOUSE_CHECKPOINT_TIMEOUT` | Defaults target beaconcha.in’s state provider (900 s timeout); swap to another trusted checkpoint or run your own CL if needed. |

Customize rate limits, plan quotas, and pricing through database migrations or by updating seed data in `db/migrations/001_init.sql`.

### Consensus Client Notes
- Lighthouse runs on the stable `v7.x` series by default and boots from a finalized checkpoint (`LIGHTHOUSE_CHECKPOINT_URL`). The first snapshot download is only a few hundred megabytes, but long-term consensus data will grow into the tens of gigabytes.
- Erigon remains an archive execution client; expect 1.5–2 TB of storage consumption over time. If you do not have sufficient disk, point `RPC_PROXY_TARGET` / `RPC_PROXY_WS_TARGET` at a remote node and remove the `lighthouse`/`erigon` services from `docker-compose.yml`.
- To change mirrors, edit `LIGHTHOUSE_CHECKPOINT_URL` (see [the community list](https://eth-clients.github.io/checkpoint-sync-endpoints/)). For checkpoint bootstrap from your own CL, replace the URL with your beacon endpoint or supply local SSZ files.
- When rotating the shared JWT (stored in `config/jwt/engine.jwt`), restart **both** Lighthouse and Erigon so the Engine API handshake succeeds.

## API Surface
The REST and JSON-RPC interfaces are documented in [`API_DOCS.md`](API_DOCS.md). Highlights:
- **Auth Service (`:8080`)**: admin login, plan listing, API key CRUD, usage analytics, billing records, allowlist management, health checks, and metrics.
- **RPC Proxy (`:8545`/`:8546`)**: authenticated HTTP and WebSocket forwarding with `x-api-key` headers, batch support, block range validation, metrics, and health probes.
- **Billing Engine (`:8090`)**: exposes `/metrics` and `/health`; all billing reports are accessed via the auth service.

## Observability
- Prometheus is preconfigured (`prometheus/prometheus.yml`) to scrape the auth service, RPC proxy, billing engine, and Erigon every 15 seconds.
- Lighthouse metrics are scraped on port 5054; Grafana includes panels for consensus progress and finalized epochs.
- Grafana auto-loads dashboards from `grafana/dashboards/openpayg-overview.json`. Add more by dropping JSON into that directory and restarting the container.
- Notable metrics include:
  - `rpc_proxy_requests_total{method,plan,status}` for throughput.
  - `rpc_proxy_request_duration_ms_bucket` for latency distributions.
  - `auth_service_api_keys_total` for active keys.
  - `billing_engine_outstanding_amount{currency}` for simulated revenue.

## Database Schema
The initial migration (`db/migrations/001_init.sql`) creates:
- `users`: admin accounts with bcrypt-hashed passwords.
- `plans`: configurable rate limits, quotas, and pricing.
- `api_keys`: hashed API key secrets plus optional overrides and allowlists.
- `usage_logs`: per-request aggregates for billing and observability.
- `billing_records`: monthly invoice snapshots with overage calculations.
- `rate_limit_counters`: sliding-window counters used by the proxy.
- `ip_allow_list`: CIDR restrictions per API key.
- `node_metrics`: latency samples for Grafana charts.

Run migrations automatically with Docker (mounted into Postgres) or manually with your preferred migration tool.

## Local Development
Install dependencies once per service, then run the dev command you need:

```bash
# Auth service
cd auth-service
npm install
npm run dev

# RPC proxy
cd ../rpc-proxy
npm install
npm run dev

# Billing engine
cd ../billing-engine
npm install
npm run dev

# Dashboard
cd ../dashboard
npm install
npm run dev
```

All TypeScript projects share Node 18 settings and rely on the same `.env`. Point them at your local Postgres or reuse the Docker database.

## Testing & Linting
Each backend service uses Vitest and ESLint:

```bash
cd auth-service && npm run test && npm run lint
cd rpc-proxy && npm run test && npm run lint
cd billing-engine && npm run test && npm run lint
cd dashboard && npm run lint
```

For end-to-end validation, stand up the Docker stack and exercise the APIs using the supplied documentation or dashboards.

## Security Checklist
- Change `AUTH_JWT_SECRET`, admin credentials, and the seeded API key before exposing the stack publicly.
- Rotate the shared JWT secret in `config/jwt/engine.jwt` and restart both Erigon and Lighthouse so unauthorized clients cannot bridge the execution/consensus channels.
- Restrict API access with per-key CIDR allowlists and rotate keys regularly.
- Monitor `rpc_proxy_requests_total` and `rate_limit_counters` to detect abuse.
- Run Grafana behind authentication or VPN if you deploy outside of localhost.
- Consider swapping the default PostgreSQL password and enabling TLS when running in production.

## License
Falcon-RPC---Fastest-RPC is released under the [MIT License](LICENSE).
