# OpenPayG RPC

OpenPayG RPC is a fully open-source, self-hosted alternative to commercial blockchain infrastructure providers. It combines an Erigon execution node, authenticated JSON-RPC proxy, API key management, metered billing simulation, observability, and a web dashboard into a single docker-compose deployment.

## Highlights
- **Archive-grade Erigon node** with expanded `eth_getLogs` and `trace_*` support.
- **API key & auth service** with JWT-secured admin console, plan management, IP allowlists, and Prometheus metrics.
- **High-throughput RPC proxy** that enforces per-plan rate limits, block-range ceilings, Prometheus metrics, and per-request usage logging.
- **Billing engine** that simulates PAYG invoices from usage logs and publishes metrics for Grafana dashboards.
- **React + Next.js dashboard** for managing keys, monitoring usage, and reviewing billing in real time.
- **Prometheus + Grafana** stack with prebuilt dashboards for RPC throughput, latency, billing totals, and node health.
- **One-command install** via `docker compose up -d` with MIT-licensed source.

## Quick Start

```bash
# clone and configure
git clone https://github.com/your-org/openpayg-rpc.git
cd openpayg-rpc
cp .env.example .env

# launch the full stack
docker compose up -d --build

# follow service logs (optional)
docker compose logs -f auth-service rpc-proxy billing-engine dashboard
```

Default endpoints after startup:

| Service | URL |
|---------|-----|
| RPC Proxy | `http://localhost:8545` (HTTP) / `ws://localhost:8546` |
| Auth API | `http://localhost:8080` |
| Dashboard | `http://localhost:3000` |
| Prometheus | `http://localhost:9090` |
| Grafana | `http://localhost:3001` |

Grafana default credentials: `admin` / `admin` (configurable via `.env`).

> **Note:** Erigon will initiate a full mainnet sync. The first start can require substantial disk (>= 1.5 TB) and time. You can swap the node backend for Nethermind by editing `docker-compose.yml`.

## First Call Walkthrough

1. Log in to the dashboard (`http://localhost:3000`) using the admin credentials set in `.env` (defaults: `admin@example.com` / `change_me`).
2. Create a new API key or use the seeded key (`ADMIN_DEFAULT_API_KEY`).
3. Execute a wide-range query:

```bash
curl -X POST http://localhost:8545 \
  -H 'Content-Type: application/json' \
  -H 'x-api-key: local-admin-key' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_getLogs","params":[{"fromBlock":"0x1330000","toBlock":"0x133ffff"}]}'
```

4. Open the dashboard and Prometheus/Grafana to see usage, rate-limit metrics, and simulated billing update within seconds.

## Service Topology

```
User/DApp --> RPC Proxy (Fastify) --> Erigon Node
                     |-> PostgreSQL (usage, billing, allowlists)
                     |-> Prometheus metrics exporter
Auth Service <------/ 
Dashboard (Next.js) -> Auth/Billing APIs
Billing Engine -----> PostgreSQL & Prometheus
Prometheus ---------> Grafana Dashboards
```

## Plans & Limits

| Plan | Block Range | Rate Limit | Monthly Quota | Price / 1k |
|------|-------------|------------|---------------|------------|
| Free | 10 blocks | 10 req/min | 5k calls | $0.00 |
| Dev | 1,000 blocks | 100 req/min | 50k calls | $0.01 |
| Pro | 1,000,000 blocks | 500 req/min | Unlimited | $0.005 |

Plan characteristics (rate limit, block range, quota, price) live in `plans` table and can be customized.

## Monitoring & Dashboards

- Prometheus scrapes metrics from `auth-service`, `rpc-proxy`, `billing-engine`, and Erigon.
- Grafana is auto-provisioned with an overview board (`grafana/dashboards/openpayg-overview.json`).
- Additional dashboards can be added by dropping JSON into `grafana/dashboards` and restarting Grafana.

### Key Prometheus Metrics
- `rpc_proxy_requests_total{method,plan,status}` – per-plan RPC throughput.
- `rpc_proxy_request_duration_ms_bucket` – request latency histogram.
- `auth_service_api_keys_total` – total keys issued.
- `billing_engine_outstanding_amount` – simulated revenue for the current month.

## Development

```bash
# auth service
cd auth-service
npm install
npm run dev

# rpc proxy
cd ../rpc-proxy
npm install
npm run dev

# billing engine
cd ../billing-engine
npm install
npm run dev

# dashboard (Next.js)
cd ../dashboard
npm install
npm run dev
```

Use the same `.env` file for local runs; each service reads it via `dotenv`.

## Testing & Linting

Each service ships with light unit coverage via Vitest:

```bash
cd auth-service && npm run test && cd ..
cd rpc-proxy && npm run test && cd ..
cd billing-engine && npm run test && cd ..
```

CI (`.github/workflows/ci.yml`) installs dependencies, compiles TypeScript, executes unit tests, and builds all Docker images.

## Security Notes
- API keys are hashed with bcrypt and stored in PostgreSQL (`pgcrypto` required).
- All RPC calls must include `x-api-key`; missing/invalid keys receive HTTP 401.
- Optional IP allowlists per key restrict access to trusted networks.
- JWT-protected admin API; rotate `AUTH_JWT_SECRET` and admin credentials before production use.
- The default admin key is seeded for convenience—change it immediately in real deployments.

## License

MIT License — see [LICENSE](./LICENSE).
