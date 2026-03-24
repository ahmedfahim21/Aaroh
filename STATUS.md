# Aaroh — Project Status

## What's Done

### Core Shopping Library (`shopping/`)
- **`session.py`** — Stateful cart management, merchant discovery via `/.well-known/ucp`, both checkout flows (human-signed + autonomous)
- **`agent_loop.py`** — Gemini-powered agentic reasoning with 20-iteration cap, real-time SSE event emission
- **`tools.py`** — Tool registry + dispatcher for 7 agent tools
- **`evm.py`** — EIP-3009 USDC signing (TransferWithAuthorization typed data), account management
- **`identity.py`** — EIP-8004 on-chain registration, per-agent key support, `.erc8004_agent_id` caching

### Autonomous Agent (`agent.py`)
- FastAPI service on port 8004
- EIP-8004 identity registration (`POST /register`)
- Task dispatch with SSE streaming (`POST /shop`, `GET /tasks/{id}/events`)
- Task history with running/done/failed states
- Per-agent derived private key support

### MCP Client (`mcp_client.py`)
- stdio MCP server for Claude Desktop
- 10 tools: `discover_merchant`, `browse_categories`, `search_products`, `get_product`, `add_to_cart`, `view_cart`, `update_cart`, `remove_from_cart`, `checkout`, `complete_checkout`
- Bonus: `list_merchants` (parallel probing), `find_merchant` (fuzzy search)
- Human-signed checkout flow (user signs EIP-3009 in their wallet)

### Merchant Onboarding CLI (`onboard_merchant.py`)
- CSV validation → SQLite DBs (products.db, transactions.db)
- Generates `catalogue.json`, `discovery_profile.json`, shipping rates
- Runs `import_csv.py` to populate databases

### UCP Merchant REST Server (`rest/python/server/`)
- **Discovery:** `GET /.well-known/ucp` with EVM x402 payment handler
- **Products:** `GET /products` (search + category filter), `GET /products/{id}`, `GET /catalogue`
- **Checkout:** Full lifecycle — create session → update → complete (with inventory decrement)
- **x402 payments:** Dynamic per-checkout verification + settlement via x402.org facilitator
- **Orders:** Creation, retrieval, fulfillment records
- Async SQLAlchemy + SQLite; CORS-enabled

### Next.js Web App (`chat/`)
- **Auth:** Auth.js with email/password + guest mode
- **Agents UI:** Grid view, detail view with task sidebar, real-time SSE task events
- **Agent creation:** Privy wallet connect → client-side per-agent key derivation (`keccak256(sig || agentId)`)
- **Fund agent dialog:** Send USDC to agent wallet
- **Merchants UI:** List, onboard (CSV upload + wallet address)
- **Chat:** Claude-powered with artifact rendering (code, text, images, spreadsheets)
- **DB schema:** `User`, `Chat`, `Message_v2`, `Document`, `Merchant`, `Agent`, `AgentSession` (Drizzle + PostgreSQL)
- **API routes:** Full CRUD for agents, merchants, sessions; SSE proxy for agent events

### Crypto & Identity
- EIP-3009 USDC payment signing (Base Sepolia)
- EIP-8004 agent identity on-chain (IdentityRegistry NFT)
- x402 dynamic payment requirement + facilitator settlement
- Per-agent key derivation (never stored, client-side only)

### Example Merchant Data
- `deploy/artisan-india/` — fully populated SQLite DBs + discovery profile, ready to run
- `demo_data/` — sample CSV catalogues

---

## Tech Stack

| Layer | Tech |
|---|---|
| Agent reasoning | Google Gemini 2.0-flash |
| Chat | Claude (Anthropic AI SDK) |
| Web app | Next.js 16, React 19, Drizzle ORM, Auth.js |
| Wallet | Privy (`@privy-io/react-auth`) |
| Python services | FastAPI, SQLAlchemy, eth-account, web3.py, httpx |
| Storage | PostgreSQL (web app), SQLite (merchant servers) |
| Payments | USDC EIP-3009 on Base Sepolia via x402 |
| Identity | EIP-8004 on Base Sepolia |
| File storage | Vercel Blob |

---

## Deployed Contracts (Base Sepolia)

| Contract | Address |
|---|---|
| IdentityRegistry | `0x7343dFdc3E9adf2B4D2645bE7Cb12426dB5cae1e` |
| ReputationRegistry | `0x0a41808952EBeF39Ae90E2f71B44586C47fCD9b5` |
| ValidationRegistry | `0x862b7c3F12990aF971a76F249D5B57efe7465F3E` |
| USDC (Base Sepolia) | `0x036CbD53842c5426634e7929541eC2318f3dCf7e` |
