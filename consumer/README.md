# Aaroh Consumer — `consumer/`

Next.js app (port 3000) for shoppers. Provides AI-powered chat, autonomous agent management, and the shopping UI.

Part of the [Aaroh agentic commerce stack](../README.md).

## Routes

| Route | Description |
|---|---|
| `/` | Landing page — Privy login + role selection |
| `/chat` | New chat with Claude + MCP tools |
| `/chat/[id]` | Existing conversation |
| `/agents` | Agent grid |
| `/agents/[id]` | Agent detail + task dispatch |

## Dev

```bash
cp .env.example .env.local
pnpm install
pnpm db:migrate   # consumer owns all DB migrations
pnpm dev          # http://localhost:3000
```

## DB Migrations

This app is the **single source of truth** for all migrations (both consumer and merchant share the same DB).

```bash
pnpm db:generate  # generate SQL after editing lib/db/schema.ts
pnpm db:migrate   # apply pending migrations
pnpm db:studio    # visual DB browser
```

## Key Env Vars

| Variable | Description |
|---|---|
| `POSTGRES_URL` | PostgreSQL connection string |
| `AUTH_SECRET` | Auth.js secret |
| `NEXT_PUBLIC_PRIVY_APP_ID` | Privy app ID |
| `NEXT_PUBLIC_MERCHANT_APP_URL` | Merchant app URL (default: `http://localhost:3001`) |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini API key |
| `AGENT_URL` | Autonomous agent URL (default: `http://localhost:8004`) |
