# Aaroh — Agentic Commerce

A crypto-native agentic commerce stack. AI agents discover merchants, shop autonomously, and pay with USDC — no human in the loop.

Built on the [Universal Commerce Protocol (UCP)](https://developers.google.com/merchant/ucp/guides) with [x402](https://x402.org) crypto payments (USDC / EIP-3009) and [EIP-8004](https://github.com/EIPs-CodeLab/ERC-8004) trustless agent identity.

---

## How It Works

### For Merchants — Go Live in Minutes

Provide a **product catalogue CSV** and an **EVM wallet address** to receive USDC payments. That's it.

```
Catalogue CSV + EVM Wallet → UCP-Compliant Merchant Server → Visible to Any AI Agent
```

The onboarding flow generates a fully compliant UCP server with discovery, product search, checkout sessions, and x402 payment verification. Start it from the **Dashboard** in the merchant app.

### For Agents — Autonomous Shopping

Each agent has its own derived EVM wallet (no shared key). The agent:

1. **Discovers** a UCP merchant via `/.well-known/ucp`
2. **Searches** the catalogue and **adds** items to cart
3. **Checks out**, signs an EIP-3009 USDC `TransferWithAuthorization`
4. **Submits** the signed `X-PAYMENT` header to complete the order

The autonomous loop is started with `POST /shop` (consumer agents pass `consumer_agent_id` so keys stay on the agent server). Checkout uses a two-step **x402** flow: `checkout` (HTTP 402 payment requirements) then `submit_payment` (signed `X-PAYMENT`).

### Agent wallets (server-side)

Per-consumer-app agents get an EVM keypair generated on **`agent.py`**, encrypted at rest (`AGENT_KEY_ENCRYPTION_SECRET`), and registered on EIP-8004 when the registry is configured. The consumer app stores only the **public address** and `userId`; private keys are never sent to the browser or Next.js.

---

## Architecture

```
┌─────────────────────────────┐   ┌─────────────────────────────┐
│  consumer/  (port 3000)     │   │  merchant/  (port 3001)     │
│  ┌─────────┐  ┌──────────┐  │   │  ┌───────────┐  ┌───────┐  │
│  │  Chat   │  │  Agents  │  │   │  │ Dashboard │  │Onboard│  │
│  └─────────┘  └──────────┘  │   │  └───────────┘  └───────┘  │
│  Privy auth · Claude + MCP  │   │  Privy auth · UCP mgmt      │
└─────────────────────────────┘   └─────────────────────────────┘
         │                                    │
         └──────────── PostgreSQL ────────────┘
                   (shared database)
         │
         ▼
  mcp_client.py         agent.py (port 8004)
  (stdio MCP server)    (FastAPI + Gemini)
         │                   │
         └─────────┬─────────┘
                   ▼
        UCP Merchant Server (rest/python/server/)
        ├── /.well-known/ucp
        ├── /products, /catalogue
        ├── /checkout-sessions
        └── x402 payment verification
                   │
                   ▼
       USDC on Ethereum Sepolia (EIP-3009)
```

---

## Project Structure

| Path | Description |
|---|---|
| [`consumer/`](consumer/) | Next.js app (port 3000) — Chat, Agents, shopping UI |
| [`merchant/`](merchant/) | Next.js app (port 3001) — Dashboard, merchant onboarding |
| [`agent.py`](agent.py) | Autonomous shopping agent — FastAPI + EIP-8004 identity |
| [`mcp_client.py`](mcp_client.py) | MCP server for Claude Desktop / any MCP client |
| [`shopping/`](shopping/) | Shared shopping session library (used by agent + MCP) |
| [`onboard_merchant.py`](onboard_merchant.py) | CLI: CSV → UCP merchant package |
| [`rest/python/server/`](rest/python/server/) | UCP merchant server (FastAPI + SQLite + x402) |
| [`demo_data/`](demo_data/) | Sample product catalogues |

---

## Quick Start

### Prerequisites

- Python ≥ 3.10 + [uv](https://docs.astral.sh/uv/)
- Node.js ≥ 18 + pnpm
- PostgreSQL database (or a [Supabase](https://supabase.com) project)
- A funded USDC wallet on **Ethereum Sepolia** (for the agent to pay)

### 1. Start the Consumer App

```bash
cd consumer
cp .env.example .env.local
# Fill in: POSTGRES_URL, AUTH_SECRET, GOOGLE_GENERATIVE_AI_API_KEY, NEXT_PUBLIC_PRIVY_APP_ID
# Optional: NEXT_PUBLIC_MERCHANT_APP_URL (default: http://localhost:3001)

pnpm install
pnpm db:migrate    # apply migrations (consumer owns all migrations)
pnpm dev           # http://localhost:3000
```

### 2. Start the Merchant App

```bash
cd merchant
cp .env.example .env.local
# Fill in: POSTGRES_URL, AUTH_SECRET, NEXT_PUBLIC_PRIVY_APP_ID
# Optional: NEXT_PUBLIC_CONSUMER_APP_URL (default: http://localhost:3000)

pnpm install
pnpm dev           # http://localhost:3001
```

> **Note:** Only `consumer/` owns DB migrations. Never run `drizzle-kit generate` from `merchant/`.

### 3. Onboard a Merchant

**From the web app** — go to the **Merchant app → Onboard**, upload a catalogue CSV and enter your EVM wallet. The UCP server starts automatically.

**From the CLI:**

```bash
uv run onboard_merchant.py \
  --catalogue demo_data/artisan-india.csv \
  --merchant-name "Artisan India" \
  --merchant-wallet "0xYourWallet" \
  --output-dir deploy/artisan-india
```

Then start the UCP server:

```bash
cd rest/python/server
uv run server.py \
  --products_db_path=../../deploy/artisan-india/data/products.db \
  --discovery_profile_path=../../deploy/artisan-india/discovery_profile.json \
  --port=8000
```

Set `MERCHANT_WALLET=0xYourWallet` in the server env to enable x402 payment verification.

### 4. Start the Autonomous Agent

```bash
cp .env.example .env   # root level
# Required for consumer-created agents: AGENT_KEY_ENCRYPTION_SECRET
# Recommended: AGENT_API_SECRET (same value in consumer as AGENT_API_SECRET for Bearer auth)
# Also: GEMINI_API_KEY; optional AGENT_PRIVATE_KEY for demo / AGENT_TASK without consumer_agent_id
# Optional: ERC8004_IDENTITY_REGISTRY, IDENTITY_REGISTRY_RPC

uv run agent.py        # http://localhost:8004
```

On first request to `/identity`, the process can register a **global** EIP-8004 identity (when env is set) and cache `agentId` in `.erc8004_agent_id`. Per-agent registration happens on `POST /agents`.

### 5. Create Agents from the Consumer App

1. Go to **Agents → + New Agent** (you must be logged in)
2. The consumer app calls `agent.py` `POST /agents` to mint keys server-side; the card shows the agent address
3. Fund that address with USDC on **Base Sepolia**
4. Dispatch a task — the agent shops and pays via x402 without sending private keys over the wire

### 6. Connect to Claude Desktop (MCP)

```json
{
  "mcpServers": {
    "shopping": {
      "command": "uv",
      "args": ["run", "python", "mcp_client.py"],
      "cwd": "/path/to/agentic-commerce",
      "env": {
        "MERCHANT_URL": "http://localhost:8000"
      }
    }
  }
}
```

---


### 7. Start the Landing Page (Optional)

```bash
cd landing
pnpm install
pnpm dev           # http://localhost:4000
```

## Database Migrations

`consumer/` is the **single source of truth** for all DB migrations. Both apps share the same PostgreSQL database.

```bash
# Generate a new migration (after editing consumer/lib/db/schema.ts)
cd consumer && pnpm db:generate

# Apply pending migrations
cd consumer && pnpm db:migrate

# Inspect the DB visually
cd consumer && pnpm db:studio   # or: cd merchant && pnpm db:studio
```

---

## MCP Tools

Available to any MCP-connected AI agent (Claude Desktop, etc.):

| Tool | Description |
|---|---|
| `discover_merchant` | Connect to a merchant via `/.well-known/ucp` |
| `browse_categories` | List all product categories |
| `search_products` | Search by keyword and/or category |
| `get_product` | Get full product details |
| `add_to_cart` | Add a product to the cart |
| `view_cart` | View current cart |
| `update_cart` | Update item quantity |
| `remove_from_cart` | Remove an item |
| `checkout` | Create checkout session (returns order total + merchant wallet) |
| `complete_checkout` | Submit signed EIP-3009 x_payment to finalise the order |

---

## Payments — x402 / EIP-3009

All payments use **USDC on Ethereum Sepolia** via the [x402 protocol](https://x402.org):

- Token: `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` (USDC, Ethereum Sepolia)
- Scheme: `exact` — agent signs an EIP-3009 `TransferWithAuthorization`
- Facilitator: `https://x402.org/facilitator` (configurable via `X402_FACILITATOR_URL`)
- Amount unit: USDC micro-units (6 decimals) — `cents × 10_000`

---

## Agent Identity — EIP-8004

The autonomous agent registers a trustless on-chain identity via [EIP-8004](https://github.com/EIPs-CodeLab/ERC-8004):

| Contract | Address (Ethereum Sepolia) |
|---|---|
| IdentityRegistry | `0x7343dFdc3E9adf2B4D2645bE7Cb12426dB5cae1e` |
| ReputationRegistry | `0x0a41808952EBeF39Ae90E2f71B44586C47fCD9b5` |
| ValidationRegistry | `0x862b7c3F12990aF971a76F249D5B57efe7465F3E` |

The `agentId` (uint256 NFT) is included in the `UCP-Agent` header on every request:
```
UCP-Agent: profile="evm:0xAgentAddress;erc8004=42"
```

---

## Catalogue Format

| Column | Required | Description |
|---|---|---|
| `id` | Yes | Unique product identifier |
| `title` | Yes | Product name |
| `price` | Yes | Price in **USD cents** (e.g. `2800` = $28.00) |
| `image_url` | Yes | Product image URL |
| `description` | No | Product description |
| `category` | No | Product category |
| `inventory_quantity` | No | Stock count (default: 100) |

---

## Environment Variables

### Consumer App (`consumer/.env.local`)

| Variable | Description |
|---|---|
| `POSTGRES_URL` | PostgreSQL connection string |
| `AUTH_SECRET` | Auth.js secret (`openssl rand -base64 32`) |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini API key (for chat) |
| `NEXT_PUBLIC_PRIVY_APP_ID` | Privy app ID (wallet + social login) |
| `NEXT_PUBLIC_MERCHANT_APP_URL` | Merchant app URL (default: `http://localhost:3001`) |
| `AGENT_URL` | Autonomous agent URL (default: `http://localhost:8004`) |
| `AGENT_API_SECRET` | Bearer token for `agent.py` (must match server `AGENT_API_SECRET` when set) |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob token (file uploads) |

### Merchant App (`merchant/.env.local`)

| Variable | Description |
|---|---|
| `POSTGRES_URL` | PostgreSQL connection string (same DB as consumer) |
| `AUTH_SECRET` | Auth.js secret (same value as consumer) |
| `NEXT_PUBLIC_PRIVY_APP_ID` | Privy app ID (same value as consumer) |
| `NEXT_PUBLIC_CONSUMER_APP_URL` | Consumer app URL (default: `http://localhost:3000`) |

### Agent (`agent.py`)

| Variable | Description |
|---|---|
| `AGENT_API_SECRET` | If set, all routes except `GET /health` require `Authorization: Bearer …` |
| `AGENT_KEY_ENCRYPTION_SECRET` | Secret for encrypting per-agent keys (required for `POST /agents`) |
| `AGENT_KEYS_STORE` | Path to JSON key store (default: `.agent_keys.json` in cwd) |
| `AGENT_PRIVATE_KEY` | Optional global fallback key when `consumer_agent_id` is not used |
| `GEMINI_API_KEY` | Google Gemini API key |
| `GEMINI_MODEL` | Model name (default: `gemini-2.5-flash`) |
| `ERC8004_IDENTITY_REGISTRY` | IdentityRegistry contract address |
| `IDENTITY_REGISTRY_RPC` | Base Sepolia RPC URL |
| `X402_NETWORK` | Chain ID string (default: `eip155:84532`) |
| `MERCHANT_URL` | Default merchant URL |

### UCP Merchant Server

| Variable | Description |
|---|---|
| `MERCHANT_WALLET` | EVM wallet address to receive USDC (enables x402) |
| `X402_NETWORK` | Chain ID string (default: `eip155:11155111`) |
| `X402_FACILITATOR_URL` | x402 facilitator URL (default: `https://x402.org/facilitator`) |

---

## UCP Compliance

- **Protocol version:** `2026-01-11`
- **Discovery:** `/.well-known/ucp`
- **Capabilities:** checkout, order, discount, fulfillment, buyer consent
- **Payment handler:** `org.ethereum.evm` (x402 / EIP-3009 USDC)
- **Headers:** `UCP-Agent`, `Request-Signature`, `Idempotency-Key`, `Request-Id`

---

## License

Apache 2.0 — see [LICENSE](LICENSE) for details.
