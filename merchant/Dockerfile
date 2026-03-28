# ---------- Stage 1: Dependencies ----------
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate
WORKDIR /repo/merchant
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ---------- Stage 2: Build ----------
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate
WORKDIR /repo/merchant
COPY --from=deps /repo/merchant/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm build

# ---------- Stage 3: Runtime ----------
FROM node:20-alpine AS runner
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate

# Install Python + uv (the Next.js app spawns UCP servers via `uv run server.py`)
RUN apk add --no-cache python3 py3-pip curl bash && \
    curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:$PATH"

# Mirror repo layout: /repo/merchant is cwd, /repo/rest, /repo/deploy etc. are siblings
WORKDIR /repo/merchant

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Copy built Next.js app
COPY --from=builder /repo/merchant/.next ./.next
COPY --from=builder /repo/merchant/node_modules ./node_modules
COPY --from=builder /repo/merchant/package.json ./package.json
COPY --from=builder /repo/merchant/public ./public
COPY --from=builder /repo/merchant/next.config.ts ./next.config.ts

# UCP server code + onboard script are mounted as volumes at runtime
# (see docker-compose.yml)

EXPOSE 3001

CMD ["pnpm", "start"]