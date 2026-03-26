"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAgentBalance } from "@/hooks/use-agent-balance";
import { FundAgentDialog } from "./fund-agent-dialog";
import type { Agent } from "@/lib/db/schema";

export function AgentCard({ agent }: { agent: Agent }) {
  const router = useRouter();
  const { balance, refetch } = useAgentBalance(agent.walletAddress as `0x${string}`);
  const [fundOpen, setFundOpen] = useState(false);

  const shortAddr = `${agent.walletAddress.slice(0, 6)}…${agent.walletAddress.slice(-4)}`;

  return (
    <>
      <div
        className="rounded-lg border bg-card p-4 flex flex-col gap-3 cursor-pointer hover:border-primary/40 transition-colors"
        onClick={() => router.push(`/agents/${agent.id}`)}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="font-medium truncate">{agent.name}</h3>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">{shortAddr}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-medium tabular-nums">
              {balance !== null ? `$${balance}` : "—"}
            </p>
            <p className="text-xs text-muted-foreground">USDC</p>
          </div>
        </div>

        {agent.instructions && (
          <p className="text-xs text-muted-foreground line-clamp-2">{agent.instructions}</p>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted"
            onClick={(e) => {
              e.stopPropagation();
              setFundOpen(true);
            }}
          >
            Fund Agent
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
          setTimeout(refetch, 3000);
        }}
      />
    </>
  );
}
