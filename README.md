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

The onboarding flow generates a fully compliant UCP server with discovery, product search, checkout sessions, and x402 payment verification. Start it from the **Merchants** tab in the web app.

### For Agents — Autonomous Shopping

Each agent has its own derived EVM wallet (no shared key). The agent:

1. **Discovers** a UCP merchant via `/.well-known/ucp`
2. **Searches** the catalogue and **adds** items to cart
3. **Checks out**, signs an EIP-3009 USDC `TransferWithAuthorization`
4. **Submits** the signed `X-PAYMENT` header to complete the order

The full loop runs in a single `POST /shop` call — no human confirmation needed.

### Wallet Key Derivation (No Master Key Stored)

Agent wallets are derived entirely client-side:

1. User connects via **Privy** and signs a deterministic message: `"Aaroh Agent Master Key v1"`
2. Signature is cached in `localStorage`
3. Per-agent private key: `keccak256(sig_bytes ++ agentId_bytes)` (viem, client-side)
4. Only the derived **address** is stored in the DB — never the private key
5. At dispatch time, the client re-derives the key and sends it in the request body (in-memory only on the server)

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  chat/  (Next.js — port 4000)                                 │
│  ┌──────────┐  ┌────────┐  ┌───────────┐                     │
│  │   Chat   │  │ Agents │  │ Merchants │  ← Top navbar        │
│  └──────────┘  └────────┘  └───────────┘                     │
│       │             │             │                           │
│  Claude + MCP   Agent sessions  UCP server mgmt              │
└──────────────────────────────────────────────────────────────┘
         │                   │
         ▼                   ▼
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
| [`chat/`](chat/) | Next.js web app — Chat, Agents, Merchants |
| [`agent.py`](agent.py) | Autonomous shopping agent — FastAPI + EIP-8004 identity |
| [`mcp_client.py`](mcp_client.py) | MCP server for Claude Desktop / any MCP client |
| [`shopping/`](shopping/) | Shared shopping session library (used by both agent + MCP) |
| [`onboard_merchant.py`](onboard_merchant.py) | CLI: CSV → UCP merchant package |
| [`rest/python/server/`](rest/python/server/) | UCP merchant server (FastAPI + SQLite + x402) |
| [`demo_data/`](demo_data/) | Sample product catalogues |

---

## Quick Start

### Prerequisites

- Python ≥ 3.10 + [uv](https://docs.astral.sh/uv/)
- Node.js ≥ 18 + pnpm
- A funded USDC wallet on **Ethereum Sepolia** (for the agent to pay)
- PostgreSQL database (or a [Supabase](https://supabase.com) project)

### 1. Start the Web App

```bash
cd chat
cp .env.example .env.local
# Fill in POSTGRES_URL, AUTH_SECRET, GOOGLE_GENERATIVE_AI_API_KEY, NEXT_PUBLIC_PRIVY_APP_ID

pnpm install
pnpm db:generate   # generate migration SQL
# Apply migrations: pnpm db:push  OR  paste SQL into your DB console
pnpm dev           # http://localhost:4000
```

### 2. Onboard a Merchant

**From the web app** — go to **Merchants → Onboard**, upload a catalogue CSV and enter your EVM wallet. The server starts automatically.

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

### 3. Start the Autonomous Agent

```bash
cp .env.example .env   # root level
# Set: AGENT_PRIVATE_KEY, GEMINI_API_KEY, ERC8004_IDENTITY_REGISTRY, IDENTITY_REGISTRY_RPC

uv run agent.py        # http://localhost:8004
```

On first run, the agent registers an EIP-8004 identity on Ethereum Sepolia (NFT mint) and caches the `agentId` in `.erc8004_agent_id`.

### 4. Create Agents from the Web App

1. Go to **Agents → + New Agent**
2. Connect your wallet via Privy (sign the master key message)
3. An EVM address is derived client-side and shown on the card
4. Fund the agent with USDC (Ethereum Sepolia) using the **Fund Agent** button
5. Navigate to the agent, dispatch a task — the agent shops and pays autonomously

### 5. Connect to Claude Desktop (MCP)

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

### Web App (`chat/.env.local`)

| Variable | Description |
|---|---|
| `POSTGRES_URL` | PostgreSQL connection string |
| `AUTH_SECRET` | Auth.js secret (run `openssl rand -base64 32`) |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini API key (for chat) |
| `NEXT_PUBLIC_PRIVY_APP_ID` | Privy app ID (wallet connect) |
| `AGENT_URL` | Autonomous agent URL (default: `http://localhost:8004`) |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob token (file uploads) |

### Agent (`agent.py`)

| Variable | Description |
|---|---|
| `AGENT_PRIVATE_KEY` | 0x-prefixed hex private key for the global agent wallet |
| `GEMINI_API_KEY` | Google Gemini API key |
| `GEMINI_MODEL` | Model name (default: `gemini-2.0-flash`) |
| `ERC8004_IDENTITY_REGISTRY` | IdentityRegistry contract address (Ethereum Sepolia) |
| `IDENTITY_REGISTRY_RPC` | Ethereum Sepolia RPC URL |
| `X402_NETWORK` | Chain ID string (default: `eip155:84532`) |
| `MERCHANT_URL` | Default merchant URL for startup task |

### UCP Merchant Server

| Variable | Description |
|---|---|
| `MERCHANT_WALLET` | EVM wallet address to receive USDC (enables x402) |
| `X402_NETWORK` | Chain ID string (default: `eip155:84532`) |
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
