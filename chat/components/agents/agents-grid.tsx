"use client";

import { useState } from "react";
import useSWR from "swr";
import { usePrivy } from "@privy-io/react-auth";
import { AgentCard } from "./agent-card";
import { CreateAgentDialog } from "./create-agent-dialog";
import type { Agent } from "@/lib/db/schema";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function AgentsGrid() {
  const { data: agents, mutate } = useSWR<Agent[]>("/api/agents", fetcher);
  const { ready, authenticated, login } = usePrivy();
  const [createOpen, setCreateOpen] = useState(false);

  if (!agents) {
    return <p className="text-sm text-muted-foreground p-6">Loading agents…</p>;
  }

  return (
    <div className="p-6 overflow-y-auto h-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Agents</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Autonomous shopping agents with their own wallets</p>
        </div>
        <div className="flex items-center gap-2">
          {ready && !authenticated && (
            <button
              type="button"
              onClick={login}
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
            >
              Connect Wallet
            </button>
          )}
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            + New Agent
          </button>
        </div>
      </div>

      {agents.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="text-sm text-muted-foreground">
            No agents yet. Create one to get started.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((ag) => (
            <AgentCard key={ag.id} agent={ag} />
          ))}
        </div>
      )}

      <CreateAgentDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => mutate()}
      />
    </div>
  );
}
