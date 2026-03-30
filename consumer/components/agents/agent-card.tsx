"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import {
  Activity,
  Clock,
  ExternalLink,
  Fingerprint,
  Link2,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { useAgentBalance } from "@/hooks/use-agent-balance";
import { CopyAgentAddressButton } from "./copy-agent-address-button";
import { FundAgentDialog } from "./fund-agent-dialog";
import type { AgentWithStats } from "@/lib/db/schema";
import {
  BASE_SEPOLIA_EXPLORER,
  ERC8004_IDENTITY_REGISTRY_ADDRESS,
} from "@/lib/constants";
import { cn } from "@/lib/utils";

export function AgentCard({ agent }: { agent: AgentWithStats }) {
  const router = useRouter();
  const { usdcBalance, ethBalance, refetchUntilChanged } = useAgentBalance(
    agent.walletAddress as `0x${string}`
  );
  const [fundOpen, setFundOpen] = useState(false);

  const shortAddr = `${agent.walletAddress.slice(0, 6)}…${agent.walletAddress.slice(-4)}`;
  const registered = Boolean(agent.erc8004Id);
  const explorerAddress = `${BASE_SEPOLIA_EXPLORER}/address/${agent.walletAddress}`;
  const nftHref =
    registered && agent.erc8004Id
      ? `${BASE_SEPOLIA_EXPLORER}/nft/${ERC8004_IDENTITY_REGISTRY_ADDRESS}/${agent.erc8004Id}`
      : null;

  const created = agent.createdAt
    ? formatDistanceToNow(new Date(agent.createdAt), { addSuffix: true })
    : null;

  return (
    <>
      <div
        className="rounded-lg border bg-card p-4 flex flex-col gap-3 cursor-pointer hover:border-primary/40 transition-colors"
        onClick={() => router.push(`/agents/${agent.id}`)}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-medium truncate">{agent.name}</h3>
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium shrink-0",
                  registered
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {registered ? (
                  <>
                    <ShieldCheck className="size-3" />
                    On-chain
                  </>
                ) : (
                  "Unregistered"
                )}
              </span>
            </div>
            <div className="mt-0.5 flex min-w-0 items-center gap-0.5">
              <Wallet className="size-3 shrink-0 text-muted-foreground" />
              <p className="min-w-0 truncate text-xs font-mono text-muted-foreground">{shortAddr}</p>
              <CopyAgentAddressButton
                address={agent.walletAddress}
                stopPropagation
                className="-mr-1"
              />
              <a
                href={explorerAddress}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-muted-foreground hover:text-foreground"
                title="View on explorer"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="size-3.5" />
              </a>
              {nftHref ? (
                <a
                  href={nftHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  title="ERC-8004 NFT"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Fingerprint className="size-3.5" />
                </a>
              ) : null}
            </div>
          </div>
          <div className="text-right shrink-0 space-y-0.5">
            <p className="text-sm font-medium tabular-nums">
              {usdcBalance !== null ? `$${usdcBalance}` : "—"}
            </p>
            <p className="text-xs text-muted-foreground">USDC</p>
            <p className="text-xs font-medium tabular-nums text-muted-foreground">
              {ethBalance !== null ? `${ethBalance} ETH` : "—"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {created ? (
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3" />
              {created}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1">
            <Activity className="size-3" />
            {agent.sessionCount} session{agent.sessionCount === 1 ? "" : "s"}
          </span>
          {(agent.ratingLiked > 0 || agent.ratingDisliked > 0) && (
            <span>
              {agent.ratingLiked}↑ {agent.ratingDisliked}↓
            </span>
          )}
        </div>

        {agent.instructions && (
          <p className="text-xs text-muted-foreground line-clamp-2">{agent.instructions}</p>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted inline-flex items-center gap-1"
            onClick={(e) => {
              e.stopPropagation();
              setFundOpen(true);
            }}
          >
            <Link2 className="size-3" />
            Fund agent
          </button>
        </div>
      </div>

      <FundAgentDialog
        open={fundOpen}
        onOpenChange={setFundOpen}
        agentAddress={agent.walletAddress as `0x${string}`}
        agentName={agent.name}
        onFunded={() => {
          setFundOpen(false);
          // Poll briefly after funding so the card reflects on-chain balances.
          void refetchUntilChanged();
        }}
      />
    </>
  );
}
