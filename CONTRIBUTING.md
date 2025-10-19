# Contributing

Thank you for your interest in improving OpenPayG RPC! This project welcomes contributions of all sizes. To keep the codebase maintainable and secure, please follow the guidelines below.

## Getting Started

1. Fork the repository and clone it locally.
2. Copy `.env.example` to `.env` and customize credentials.
3. Install dependencies for each service you plan to change (`npm install`).
4. Run unit tests with `npm run test` in the corresponding service directory.
5. Format & lint using `npm run lint` where applicable.

## Pull Request Checklist

- Describe the change and its motivation in the PR body.
- Include tests for new behaviour or explain why they are not needed.
- Update documentation (README, API docs, dashboards) if behaviour changes.
- Ensure `docker compose up` still succeeds before submitting.
- Run `docker compose build` to verify Dockerfiles.

## Coding Standards

- TypeScript services target Node 18+ and use strict TypeScript mode.
- Keep modules cohesive; prefer small functions with clear responsibilities.
- Use Prometheus metrics when adding new long-running tasks or RPC calls.
- Log actionable context with `pino` (no secrets / API keys in logs).

## Security & Secrets

- Never commit real API keys, JWT secrets, or database credentials.
- All new secrets must be configurable via environment variables.
- When handling credentials, store only salted hashes and cleanse logs.

## Reporting Issues

File issues under GitHub "Issues" with reproduction steps, expected behaviour, and environment details. Security vulnerabilities should be privately disclosed to the maintainers.

Thank you for helping make self-hosted blockchain infrastructure better for everyone!
