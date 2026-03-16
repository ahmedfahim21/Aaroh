"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { AgentSetupForm } from "./agent-setup-form";
import { TaskList } from "./task-list";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Identity {
  address?: string;
  erc8004?: { agent_id: number | null; network: string };
  payment?: { network: string; usdc_contract: string };
  error?: string;
}

export function AgentsView() {
  const { data: identity } = useSWR<Identity>("/api/agent", fetcher);
  const [liveTaskId, setLiveTaskId] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Autonomous Agent</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Dispatch shopping tasks — the agent browses, carts, and pays via x402 USDC autonomously.
        </p>
      </div>

      {identity && !identity.error && (
        <div className="rounded-lg border bg-muted/40 p-4 text-xs font-mono space-y-1">
          <div>
            <span className="text-muted-foreground">Address </span>
            <span className="select-all">{identity.address}</span>
          </div>
          {identity.erc8004?.agent_id != null && (
            <div>
              <span className="text-muted-foreground">EIP-8004 agentId </span>
              <span>{identity.erc8004.agent_id}</span>
              <span className="text-muted-foreground ml-2">on {identity.erc8004.network}</span>
            </div>
          )}
          <div>
            <span className="text-muted-foreground">Payments </span>
            <span>USDC</span>
            <span className="text-muted-foreground ml-2">on {identity.payment?.network}</span>
          </div>
        </div>
      )}

      <div className="rounded-lg border p-4 space-y-4">
        <h2 className="font-semibold text-sm">Dispatch a task</h2>
        <AgentSetupForm onTaskStarted={(id) => setLiveTaskId(id)} />
      </div>

      <div className="space-y-3">
        <h2 className="font-semibold text-sm">Task history</h2>
        <TaskList liveTaskId={liveTaskId} />
      </div>
    </div>
  );
}
