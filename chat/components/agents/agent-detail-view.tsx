"use client";

import { useCallback, useState } from "react";
import useSWR from "swr";
import { useWallets } from "@privy-io/react-auth";
import { cn } from "@/lib/utils";
import { TaskInteraction } from "./task-interaction";
import { getMasterSignature, deriveAgentKey } from "@/hooks/use-agent-master-key";
import type { Agent, AgentSession } from "@/lib/db/schema";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const STATUS_DOT: Record<string, string> = {
  running: "bg-blue-500 animate-pulse",
  done: "bg-green-500",
  failed: "bg-red-500",
};

interface AgentDetailViewProps {
  agent: Agent;
}

export function AgentDetailView({ agent }: AgentDetailViewProps) {
  const { wallets } = useWallets();
  const [selectedSession, setSelectedSession] = useState<AgentSession | null>(null);
  const [task, setTask] = useState("");
  const [merchantUrl, setMerchantUrl] = useState("");
  const [dispatching, setDispatching] = useState(false);
  const [dispatchError, setDispatchError] = useState("");

  const { data: sessions, mutate: mutateSessions } = useSWR<AgentSession[]>(
    `/api/agents/${agent.id}/sessions`,
    fetcher,
    { refreshInterval: selectedSession?.status === "running" ? 5000 : 0 }
  );

  const handleDispatch = useCallback(async () => {
    if (!task.trim()) return;
    setDispatching(true);
    setDispatchError("");

    try {
      // Derive per-agent private key client-side
      let agentPrivateKey: string | undefined;
      const wallet = wallets[0];
      if (wallet) {
        const sig = await getMasterSignature((opts) => wallet.sign(opts.message));
        agentPrivateKey = deriveAgentKey(sig, agent.id);
      }

      const trimmedUrl = merchantUrl.trim();
      const availableMerchants = trimmedUrl
        ? [{ name: trimmedUrl, url: trimmedUrl }]
        : [];

      const res = await fetch(`/api/agents/${agent.id}/sessions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ task: task.trim(), agentPrivateKey, availableMerchants }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Dispatch failed");
      }

      const session = await res.json() as AgentSession;
      setTask("");
      await mutateSessions();
      setSelectedSession(session);
    } catch (e) {
      setDispatchError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setDispatching(false);
    }
  }, [task, wallets, agent.id, mutateSessions]);

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* Sessions sidebar */}
      <aside className="w-64 shrink-0 border-r flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b shrink-0">
          <h2 className="font-medium truncate">{agent.name}</h2>
          <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate">
            {agent.walletAddress}
          </p>
        </div>

        {/* Dispatch form */}
        <div className="px-3 py-3 border-b shrink-0 flex flex-col gap-2">
          <input
            type="url"
            value={merchantUrl}
            onChange={(e) => setMerchantUrl(e.target.value)}
            placeholder="Merchant URL (e.g. http://localhost:8000)"
            disabled={dispatching}
            className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
          />
          <textarea
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="New task…"
            rows={3}
            disabled={dispatching}
            className="w-full resize-none rounded-md border bg-background px-2.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleDispatch();
            }}
          />
          {dispatchError && (
            <p className="text-xs text-destructive">{dispatchError}</p>
          )}
          <button
            type="button"
            onClick={handleDispatch}
            disabled={dispatching || !task.trim()}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 w-full"
          >
            {dispatching ? "Dispatching…" : "Dispatch Task"}
          </button>
          {wallets.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No wallet connected — agent will use server key (if any).
            </p>
          )}
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto py-2">
          {!sessions ? (
            <p className="text-xs text-muted-foreground text-center py-4">Loading…</p>
          ) : sessions.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">No sessions yet.</p>
          ) : (
            <div className="flex flex-col gap-0.5 px-2">
              {sessions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedSession(s)}
                  className={cn(
                    "flex items-start gap-2 rounded-md px-2 py-2 text-left text-xs w-full transition-colors",
                    selectedSession?.id === s.id
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-muted/50"
                  )}
                >
                  <span
                    className={cn(
                      "mt-1 h-1.5 w-1.5 rounded-full shrink-0",
                      STATUS_DOT[s.status] ?? "bg-muted-foreground"
                    )}
                  />
                  <span className="line-clamp-2 leading-snug flex-1">{s.task}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* Main area */}
      <main className="flex-1 overflow-hidden">
        {selectedSession ? (
          <TaskInteraction
            key={selectedSession.id}
            taskId={selectedSession.id}
            task={selectedSession.task}
            initialStatus={selectedSession.status}
            eventsUrl={`/api/agents/${agent.id}/sessions/${selectedSession.id}/events`}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted-foreground">
              Dispatch a task or select a session from the sidebar.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
