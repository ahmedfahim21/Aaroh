import {
  Globe,
  Banknote,
  Fingerprint,
  Wallet,
  Link2,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";

const CONSUMER_URL =
  process.env.NEXT_PUBLIC_CONSUMER_APP_URL ?? "http://localhost:3000";
const MERCHANT_URL =
  process.env.NEXT_PUBLIC_MERCHANT_APP_URL ?? "http://localhost:3001";

export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      {/* ── Header ── */}
      <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center border-b bg-background/80 backdrop-blur-sm px-6">
        <span className="font-semibold text-base tracking-tight">Aaroh</span>
        <div className="flex-1" />
        <nav className="flex items-center gap-1">
          <a
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            href={MERCHANT_URL}
          >
            For Merchants
          </a>
          <a
            className="rounded-md bg-foreground text-background px-3 py-1.5 text-sm font-medium transition-opacity hover:opacity-90"
            href={CONSUMER_URL}
          >
            Get Started
          </a>
        </nav>
      </header>

      {/* ── Hero ── */}
      <section className="flex flex-col items-center px-6 pt-24 pb-20 sm:pt-32 sm:pb-28">
        <div className="animate-fade-in-up mx-auto max-w-3xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border bg-muted/60 px-3 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
            <span className="text-xs font-medium text-muted-foreground">
              Built on UCP &middot; x402 &middot; EIP-8004
            </span>
          </div>

          <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
            Commerce where{" "}
            <span className="text-muted-foreground">AI agents</span> shop, pay,
            and sell
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-base text-muted-foreground sm:text-lg">
            Merchants onboard in minutes. Agents discover products autonomously,
            pay with USDC, and complete orders — no human in the loop.
          </p>

          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <a
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-foreground px-8 text-sm font-medium text-background transition-opacity hover:opacity-90 sm:w-auto"
              href={CONSUMER_URL}
            >
              Start Shopping
              <ArrowRight className="h-4 w-4" />
            </a>
            <a
              className="inline-flex h-11 w-full items-center justify-center rounded-lg border px-8 text-sm font-medium text-foreground transition-colors hover:bg-muted sm:w-auto"
              href={MERCHANT_URL}
            >
              Become a Merchant
            </a>
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="border-t bg-muted/40 px-6 py-20 sm:py-28">
        <div className="mx-auto max-w-5xl">
          <p className="text-center text-xs font-medium uppercase tracking-widest text-muted-foreground">
            How it works
          </p>
          <h2 className="mt-3 text-center text-2xl font-semibold tracking-tight sm:text-3xl">
            Three actors, one protocol
          </h2>

          <div className="mt-14 grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-3">
            <StepCard
              step="01"
              title="Merchant onboards"
              description="Upload a product catalogue CSV, enter an EVM wallet address, and a UCP-compliant server spins up automatically."
            />
            <StepCard
              step="02"
              title="Agent discovers"
              description="Any AI agent — Claude, Gemini, or your own — discovers the merchant via the standard /.well-known/ucp endpoint."
            />
            <StepCard
              step="03"
              title="Agent shops & pays"
              description="The agent browses, adds to cart, and signs an EIP-3009 USDC transfer. The merchant verifies via x402. Done."
            />
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="px-6 py-20 sm:py-28">
        <div className="mx-auto max-w-5xl">
          <p className="text-center text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Built for the agentic era
          </p>
          <h2 className="mt-3 text-center text-2xl font-semibold tracking-tight sm:text-3xl">
            Everything an agent needs to transact
          </h2>

          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              icon={<Globe className="h-4 w-4" />}
              title="Universal Commerce Protocol"
              description="A single API surface for discovery, catalogue, cart, checkout, and order — any LLM can speak it."
            />
            <FeatureCard
              icon={<Banknote className="h-4 w-4" />}
              title="x402 Crypto Payments"
              description="USDC payments via EIP-3009 TransferWithAuthorization. No seed phrases leave the client."
            />
            <FeatureCard
              icon={<Fingerprint className="h-4 w-4" />}
              title="EIP-8004 Agent Identity"
              description="On-chain NFT identity with reputation and validation registries. Verifiable across every merchant."
            />
            <FeatureCard
              icon={<Wallet className="h-4 w-4" />}
              title="Derived Agent Wallets"
              description="Per-agent keys derived client-side from a single Privy signature. Only the address is stored — never the key."
            />
            <FeatureCard
              icon={<Link2 className="h-4 w-4" />}
              title="MCP Compatible"
              description="Plug into Claude Desktop or any MCP-connected agent. Ten shopping tools out of the box."
            />
            <FeatureCard
              icon={<ShieldCheck className="h-4 w-4" />}
              title="Trustless & Permissionless"
              description="No API keys, no platform lock-in. Merchants and agents interact peer-to-peer through open standards."
            />
          </div>
        </div>
      </section>

      {/* ── Architecture ── */}
      <section className="border-t bg-muted/40 px-6 py-20 sm:py-28">
        <div className="mx-auto max-w-3xl">
          <p className="text-center text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Architecture
          </p>
          <h2 className="mt-3 text-center text-2xl font-semibold tracking-tight sm:text-3xl">
            Two apps, one stack
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-center text-sm text-muted-foreground">
            Consumer and merchant concerns are separated into independent
            Next.js apps sharing a single PostgreSQL database.
          </p>

          <div className="mt-12 grid gap-4 sm:grid-cols-2">
            <AppCard
              href={CONSUMER_URL}
              title="Consumer App"
              port="3000"
              lines={[
                "Chat with Claude + MCP tools",
                "Create & manage autonomous agents",
                "Derive per-agent wallets via Privy",
                "Fund agents with USDC",
              ]}
            />
            <AppCard
              href={MERCHANT_URL}
              title="Merchant App"
              port="3001"
              lines={[
                "Upload catalogue CSV to onboard",
                "UCP server starts automatically",
                "Start / stop from the dashboard",
                "x402 payment verification built in",
              ]}
            />
          </div>

          <div className="mt-4 rounded-lg border bg-card p-5">
            <div className="flex items-center gap-2 text-sm font-medium">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-muted text-xs font-mono text-muted-foreground">
                Py
              </span>
              Backend Services
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {[
                ["mcp_client.py", "MCP server for Claude"],
                ["agent.py", "Autonomous agent (port 8004)"],
                ["rest/python/server/", "UCP merchant server"],
              ].map(([name, desc]) => (
                <div
                  key={name}
                  className="rounded-md bg-muted/60 px-3 py-2"
                >
                  <p className="font-mono text-xs text-foreground">{name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="px-6 py-20 sm:py-28">
        <div className="mx-auto max-w-xl text-center">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Ready to build agentic commerce?
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Onboard a merchant in under a minute, or spin up an agent that shops
            on your behalf.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <a
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-foreground px-8 text-sm font-medium text-background transition-opacity hover:opacity-90 sm:w-auto"
              href={CONSUMER_URL}
            >
              Launch Consumer App
              <ArrowRight className="h-4 w-4" />
            </a>
            <a
              className="inline-flex h-11 w-full items-center justify-center rounded-lg border px-8 text-sm font-medium text-foreground transition-colors hover:bg-muted sm:w-auto"
              href={MERCHANT_URL}
            >
              Launch Merchant App
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t px-6 py-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm tracking-tight">Aaroh</span>
            <span className="text-xs text-muted-foreground">
              &middot; Agentic Commerce
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <a
              className="transition-colors hover:text-foreground"
              href="https://github.com/ahmedfahim21/Aaroh"
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
            <span>&middot;</span>
            <span>Apache 2.0</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ── Sub-components ── */

function StepCard({
  step,
  title,
  description,
}: {
  step: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col gap-3 bg-card p-6 sm:p-8">
      <span className="font-mono text-xs text-muted-foreground">{step}</span>
      <h3 className="font-semibold">{title}</h3>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-6">
      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
        {icon}
      </div>
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

function AppCard({
  href,
  title,
  port,
  lines,
}: {
  href: string;
  title: string;
  port: string;
  lines: string[];
}) {
  return (
    <a
      href={href}
      className="group rounded-lg border bg-card p-5 transition-colors hover:border-foreground/20"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{title}</h3>
        <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
          :{port}
        </span>
      </div>
      <ul className="mt-3 flex flex-col gap-1.5">
        {lines.map((line) => (
          <li
            key={line}
            className="flex items-start gap-2 text-sm text-muted-foreground"
          >
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/40" />
            {line}
          </li>
        ))}
      </ul>
      <div className="mt-4 flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors group-hover:text-foreground">
        Open <ArrowRight className="h-3.5 w-3.5" />
      </div>
    </a>
  );
}
