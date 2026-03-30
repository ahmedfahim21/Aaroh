"use client";

import { useCallback, useEffect, useState } from "react";
import useSWR from "swr";
import {
  Activity,
  Clock,
  ExternalLink,
  Fingerprint,
  Loader2,
  ShieldCheck,
  ThumbsUp,
  Wallet,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { CopyAgentAddressButton } from "./copy-agent-address-button";
import { TaskInteraction } from "./task-interaction";
import { FundAgentDialog } from "./fund-agent-dialog";
import { useAgentBalance } from "@/hooks/use-agent-balance";
import type { Agent, AgentSession } from "@/lib/db/schema";
import {
  BASE_SEPOLIA_EXPLORER,
  ERC8004_IDENTITY_REGISTRY_ADDRESS,
} from "@/lib/constants";
import { Button } from "@/components/ui/button";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export type AgentDetailPayload = Agent & {
  rating: { liked: number; disliked: number };
};

const STATUS_DOT: Record<string, string> = {
  running: "bg-blue-500 animate-pulse",
  done: "bg-green-500",
  failed: "bg-red-500",
};

interface AgentDetailViewProps {
  agent: AgentDetailPayload;
}

export function AgentDetailView({ agent: initialAgent }: AgentDetailViewProps) {
  const { data: agentData, mutate: mutateAgent } = useSWR<AgentDetailPayload>(
    `/api/agents/${initialAgent.id}`,
    fetcher,
    { fallbackData: initialAgent }
  );
  const agent = agentData ?? initialAgent;

  const [selectedSession, setSelectedSession] = useState<AgentSession | null>(null);
  const [task, setTask] = useState("");
  const [merchantUrl, setMerchantUrl] = useState("");
  const [dispatching, setDispatching] = useState(false);
  const [dispatchError, setDispatchError] = useState("");
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState("");
  const [fundOpen, setFundOpen] = useState(false);

  const { usdcBalance, ethBalance, refetch: refetchBalances, refetchUntilChanged } =
    useAgentBalance(agent.walletAddress as `0x${string}`);

  const { data: sessions, mutate: mutateSessions } = useSWR<AgentSession[]>(
    `/api/agents/${agent.id}/sessions`,
    fetcher,
    { refreshInterval: selectedSession?.status === "running" ? 5000 : 0 }
  );

  useEffect(() => {
    if (!sessions?.length || !selectedSession) return;
    const fresh = sessions.find((s) => s.id === selectedSession.id);
    if (!fresh) return;
    setSelectedSession((prev) => {
      if (!prev || prev.id !== fresh.id) return prev;
      if (prev.rating === fresh.rating && prev.status === fresh.status) return prev;
      return fresh;
    });
  }, [sessions, selectedSession?.id]);

  const ethNum = ethBalance != null ? Number.parseFloat(ethBalance) : 0;
  const hasEthForGas = ethNum > 0.0005;
  const registered = Boolean(agent.erc8004Id);
  const explorerAddress = `${BASE_SEPOLIA_EXPLORER}/address/${agent.walletAddress}`;
  const nftHref =
    registered && agent.erc8004Id
      ? `${BASE_SEPOLIA_EXPLORER}/nft/${ERC8004_IDENTITY_REGISTRY_ADDRESS}/${agent.erc8004Id}`
      : null;

  const created = agent.createdAt
    ? formatDistanceToNow(new Date(agent.createdAt), { addSuffix: true })
    : null;

  const handleRegister = async () => {
    setRegistering(true);
    setRegisterError("");
    try {
      const res = await fetch(`/api/agents/${agent.id}/register`, { method: "POST" });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? "Registration failed");
      }
      await mutateAgent();
      await refetchBalances();
    } catch (e) {
      setRegisterError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setRegistering(false);
    }
  };

  const handleDispatch = useCallback(async () => {
    if (!task.trim()) return;
    setDispatching(true);
    setDispatchError("");

    try {
      const trimmedUrl = merchantUrl.trim();
      const availableMerchants = trimmedUrl ? [{ name: trimmedUrl, url: trimmedUrl }] : [];

      const res = await fetch(`/api/agents/${agent.id}/sessions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ task: task.trim(), availableMerchants }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Dispatch failed");
      }

      const session = (await res.json()) as AgentSession;
      setTask("");
      await mutateSessions();
      setSelectedSession(session);
    } catch (e) {
      setDispatchError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setDispatching(false);
    }
  }, [task, merchantUrl, agent.id, mutateSessions]);

  const liked = agent.rating?.liked ?? 0;
  const disliked = agent.rating?.disliked ?? 0;
  const rated = liked + disliked;

  return (
    <div className="flex h-full w-full overflow-hidden">
      <aside className="w-72 shrink-0 border-r flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b shrink-0 space-y-3">
          <div>
            <h2 className="font-medium truncate">{agent.name}</h2>
            {created ? (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                <Clock className="size-3" />
                Created {created}
              </p>
            ) : null}
          </div>

          <div
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium",
              registered
                ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300"
                : "bg-muted text-muted-foreground"
            )}
          >
            {registered ? (
              <>
                <ShieldCheck className="size-3.5 shrink-0" />
                On-chain identity
                {agent.erc8004Id ? (
                  <span className="font-mono opacity-90">#{agent.erc8004Id}</span>
                ) : null}
              </>
            ) : (
              "Not registered on-chain"
            )}
          </div>

          <div className="space-y-1">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1">
              <Wallet className="size-3" />
              Wallet
            </p>
            <div className="flex items-start gap-1">
              <p className="min-w-0 flex-1 break-all text-xs font-mono text-muted-foreground leading-snug">
                {agent.walletAddress}
              </p>
              <CopyAgentAddressButton address={agent.walletAddress} className="mt-0.5 shrink-0" />
              <a
                href={explorerAddress}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-muted-foreground hover:text-foreground mt-0.5"
                title="Explorer"
              >
                <ExternalLink className="size-3.5" />
              </a>
            </div>
          </div>

          {nftHref ? (
            <a
              href={nftHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <Fingerprint className="size-3.5" />
              View ERC-8004 NFT on explorer
            </a>
          ) : null}

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md border bg-muted/30 px-2 py-1.5">
              <p className="text-[10px] text-muted-foreground">USDC</p>
              <p className="font-medium tabular-nums">{usdcBalance != null ? `$${usdcBalance}` : "—"}</p>
            </div>
            <div className="rounded-md border bg-muted/30 px-2 py-1.5">
              <p className="text-[10px] text-muted-foreground">ETH (gas)</p>
              <p className="font-medium tabular-nums">{ethBalance != null ? ethBalance : "—"}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="text-xs h-8"
              onClick={() => setFundOpen(true)}
            >
              Fund agent
            </Button>
            {!registered && (
              <Button
                type="button"
                size="sm"
                className="text-xs h-8"
                disabled={!hasEthForGas || registering}
                onClick={handleRegister}
                title={
                  hasEthForGas
                    ? "Register EIP-8004 identity (uses agent ETH for gas)"
                    : "Fund the agent with ETH first"
                }
              >
                {registering ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin mr-1" />
                    Registering…
                  </>
                ) : (
                  "Register identity"
                )}
              </Button>
            )}
          </div>
          {registerError ? <p className="text-xs text-destructive">{registerError}</p> : null}
          {!registered && !hasEthForGas ? (
            <p className="text-xs text-muted-foreground">
              Send Base Sepolia ETH to this agent so it can pay gas for on-chain registration.
            </p>
          ) : null}

          {rated > 0 && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <ThumbsUp className="size-3.5" />
              {liked} liked · {disliked} disliked ({rated} rated)
            </p>
          )}

          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Activity className="size-3" />
            {sessions?.length ?? 0} session{(sessions?.length ?? 0) === 1 ? "" : "s"}
          </p>
        </div>

        <div className="px-3 py-3 border-b shrink-0 flex flex-col gap-2">
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
          <input
            type="url"
            value={merchantUrl}
            onChange={(e) => setMerchantUrl(e.target.value)}
            placeholder="Merchant URL (optional)"
            disabled={dispatching}
            className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
          />
          {dispatchError && <p className="text-xs text-destructive">{dispatchError}</p>}
          <button
            type="button"
            onClick={handleDispatch}
            disabled={dispatching || !task.trim()}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 w-full"
          >
            {dispatching ? "Dispatching…" : "Dispatch Task"}
          </button>
        </div>

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

      <main className="flex-1 overflow-hidden">
        {selectedSession ? (
          <TaskInteraction
            key={selectedSession.id}
            agentId={agent.id}
            erc8004AgentId={
              agent.erc8004Id ? Number.parseInt(agent.erc8004Id, 10) : null
            }
            taskId={selectedSession.id}
            task={selectedSession.task}
            initialStatus={selectedSession.status}
            initialRating={selectedSession.rating}
            eventsUrl={`/api/agents/${agent.id}/sessions/${selectedSession.id}/events`}
            onRated={() => {
              void mutateAgent();
              void mutateSessions();
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted-foreground">
              Dispatch a task or select a session from the sidebar.
            </p>
          </div>
        )}
      </main>

      <FundAgentDialog
        open={fundOpen}
        onOpenChange={setFundOpen}
        agentAddress={agent.walletAddress as `0x${string}`}
        agentName={agent.name}
        onFunded={() => {
          setFundOpen(false);
          // Poll for balance updates after funding; the tx can take a few blocks to reflect.
          void refetchUntilChanged();
        }}
      />
    </div>
  );
}
