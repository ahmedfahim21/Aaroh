# Aaroh Merchant — `merchant/`

Next.js app (port 3001) for merchants. Provides the onboarding flow (CSV upload → UCP server) and a dashboard to manage running merchant servers.

Part of the [Aaroh agentic commerce stack](../README.md).

## Routes

| Route | Description |
|---|---|
| `/` | Login page — Privy auth |
| `/dashboard` | List of onboarded merchants + start/stop controls |
| `/onboard` | Upload catalogue CSV + EVM wallet → spin up UCP server |

## Dev

```bash
cp .env.example .env.local
pnpm install
pnpm dev   # http://localhost:3001
```

> **No DB migrations here.** Run migrations from `../consumer`. See [root README](../README.md#database-migrations).

## Key Env Vars

| Variable | Description |
|---|---|
| `POSTGRES_URL` | PostgreSQL connection string (same DB as consumer) |
| `AUTH_SECRET` | Auth.js secret (same value as consumer) |
| `NEXT_PUBLIC_PRIVY_APP_ID` | Privy app ID (same value as consumer) |
| `NEXT_PUBLIC_CONSUMER_APP_URL` | Consumer app URL (default: `http://localhost:3000`) |
