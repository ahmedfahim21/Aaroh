"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, ExternalLinkIcon, Loader2 } from "lucide-react";
import {
  lineItemsFromPurchase,
  totalCentsFromPurchase,
  txHashFromPurchase,
  txUrlFromPurchase,
} from "@/lib/checkout-receipt";
import { useTaskSSE, type AgentEvent } from "@/hooks/use-task-sse";
import { useReputationFeedback } from "@/hooks/use-reputation-feedback";
import { useTxVerification } from "@/hooks/use-tx-verification";
import { ThumbDownIcon, ThumbUpIcon } from "@/components/icons";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface TaskInteractionProps {
  agentId: string;
  erc8004AgentId: number | null;
  taskId: string;
  task: string;
  initialStatus: string;
  initialRating?: boolean | null;
  eventsUrl?: string;
  onRated?: () => void;
}

// Human-readable tool labels
function toolLabel(tool: string, args: Record<string, unknown>): string {
  switch (tool) {
    case "list_merchants":
      return args.category
        ? `Listing merchants (filter: ${args.category})`
        : "Listing merchants";
    case "find_merchant":
      return args.query ? `Finding merchant — "${args.query}"` : "Finding merchant";
    case "discover_merchant":
      return `Discovering merchant${args.merchant_url ? ` at ${args.merchant_url}` : ""}`;
    case "browse_categories":
      return "Browsing categories";
    case "search_products":
      return args.query
        ? `Searching for "${args.query}"${args.category ? ` in ${args.category}` : ""}`
        : "Searching products";
    case "get_product":
      return `Getting product details${args.product_id ? ` — ${args.product_id}` : ""}`;
    case "add_to_cart":
      return `Adding to cart${args.product_id ? ` — ${args.product_id}` : ""}${args.quantity ? ` ×${args.quantity}` : ""}`;
    case "view_cart":
      return "Viewing cart";
    case "update_cart":
      return `Updating cart — ${args.product_id}`;
    case "remove_from_cart":
      return `Removing from cart — ${args.product_id}`;
    case "checkout":
      return "Creating checkout — fetching x402 payment requirements";
    case "submit_payment":
      return "Signing and submitting x402 payment";
    default:
      return tool;
  }
}

function ToolCallBubble({
  tool,
  args,
  result,
}: {
  tool: string;
  args: Record<string, unknown>;
  result?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const label = toolLabel(tool, args);

  return (
    <div className="flex flex-col gap-1">
      {/* Agent action */}
      <div className="flex items-center gap-2 self-end max-w-[85%]">
        <div className="rounded-2xl rounded-tr-sm bg-primary px-3 py-2 text-sm text-primary-foreground">
          <span className="text-xs font-medium opacity-70 block mb-0.5">agent</span>
          {label}
        </div>
      </div>

      {/* Tool result */}
      {result !== undefined && (
        <div className="flex items-start gap-2 self-start max-w-[85%]">
          <div className="rounded-2xl rounded-tl-sm border bg-muted px-3 py-2 text-sm">
            <span className="text-xs font-medium text-muted-foreground block mb-0.5">
              result
            </span>
            <span className={cn("break-words", !expanded && "line-clamp-3")}>
              {result}
            </span>
            {result.length > 160 && (
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="text-xs text-muted-foreground underline mt-1 block"
              >
                {expanded ? "show less" : "show more"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function formatUsdFromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

function TxReceiptBadge({ txHash }: { txHash: string }) {
  const { verified, loading } = useTxVerification(txHash);
  if (loading) {
    return (
      <p className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        Verifying on-chain…
      </p>
    );
  }
  if (verified) {
    return (
      <p className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="size-3.5 shrink-0" />
        Verified on-chain
      </p>
    );
  }
  return (
    <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">Could not verify transaction receipt.</p>
  );
}

/** submit_payment success envelope from the agent (includes nested merchant checkout). */
function TaskPurchaseSummary({ purchase }: { purchase: Record<string, unknown> }) {
  const txHash = txHashFromPurchase(purchase);
  const txUrl = txUrlFromPurchase(purchase);
  const cartItems = lineItemsFromPurchase(purchase);
  const totalCents = totalCentsFromPurchase(purchase);

  const paidUsdc =
    typeof purchase.paid_usdc === "number" ? purchase.paid_usdc : undefined;

  return (
    <div className="mt-3 space-y-3 border-t border-green-200/80 pt-3 text-green-900 dark:border-green-800/80 dark:text-green-100">
      {txHash ? (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide opacity-80">Blockchain proof</p>
          <p className="mt-2 text-xs font-medium uppercase tracking-wide opacity-80">Transaction ID</p>
          <p className="mt-0.5 break-all font-mono text-xs opacity-95">{txHash}</p>
          <TxReceiptBadge txHash={txHash} />
          {txUrl ? (
            <a
              href={txUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 font-mono text-xs font-medium underline-offset-2 hover:underline"
            >
              View on Base Sepolia (block explorer)
              <ExternalLinkIcon className="size-3.5 shrink-0" />
            </a>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-amber-200/90">
          No on-chain transaction in the agent response. Ensure the merchant returns PAYMENT-RESPONSE
          or x402_transaction on checkout complete.
        </p>
      )}

      {cartItems.length > 0 && (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide opacity-80">Items</p>
          <ul className="mt-1 space-y-1 text-xs">
            {cartItems.map((it, idx) => (
              <li key={`${it.title}-${idx}`} className="flex justify-between gap-2">
                <span>
                  {it.title}
                  {it.quantity > 1 ? (
                    <span className="opacity-70"> ×{it.quantity}</span>
                  ) : null}
                </span>
                <span className="shrink-0 tabular-nums">${formatUsdFromCents(it.lineTotalCents)}</span>
              </li>
            ))}
          </ul>
          {totalCents != null && (
            <p className="mt-2 flex justify-between border-t border-green-200/80 pt-2 text-xs font-semibold dark:border-green-800/80">
              <span>Total</span>
              <span className="tabular-nums">${formatUsdFromCents(totalCents)}</span>
            </p>
          )}
        </div>
      )}

      {paidUsdc != null && (
        <p className="text-xs opacity-80">Paid {paidUsdc.toFixed(2)} USDC</p>
      )}
    </div>
  );
}

function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-2 self-end">
      <div className="rounded-2xl rounded-tr-sm bg-primary/20 px-3 py-2 text-sm text-primary">
        <span className="flex gap-1 items-center">
          <span className="animate-bounce [animation-delay:0ms] h-1.5 w-1.5 rounded-full bg-current" />
          <span className="animate-bounce [animation-delay:150ms] h-1.5 w-1.5 rounded-full bg-current" />
          <span className="animate-bounce [animation-delay:300ms] h-1.5 w-1.5 rounded-full bg-current" />
        </span>
      </div>
    </div>
  );
}

export function TaskInteraction({
  agentId,
  erc8004AgentId,
  taskId,
  task,
  initialStatus,
  initialRating,
  eventsUrl,
  onRated,
}: TaskInteractionProps) {
  const { events, done } = useTaskSSE(taskId, eventsUrl);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { submitFeedback } = useReputationFeedback();
  const [rating, setRating] = useState<boolean | null>(initialRating ?? null);
  const [ratingBusy, setRatingBusy] = useState(false);

  useEffect(() => {
    setRating(initialRating ?? null);
  }, [taskId, initialRating]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events]);

  const status = done
    ? events.some((e) => e.type === "done" && !(e as { success: boolean }).success)
      ? "failed"
      : "done"
    : initialStatus;

  // Pair tool_call with its subsequent tool_result
  type Bubble =
    | { kind: "tool"; tool: string; args: Record<string, unknown>; result?: string }
    | { kind: "thinking" }
    | { kind: "text"; text: string }
    | {
        kind: "done";
        success: boolean;
        result: string;
        order?: Record<string, unknown> | null;
      };

  const bubbles: Bubble[] = [];

  for (const evt of events as AgentEvent[]) {
    if (evt.type === "thinking") {
      bubbles.push({ kind: "thinking" });
    } else if (evt.type === "tool_call") {
      bubbles.push({ kind: "tool", tool: evt.tool, args: evt.args });
    } else if (evt.type === "tool_result") {
      // Attach result to the last tool bubble
      const last = bubbles[bubbles.length - 1];
      if (last?.kind === "tool") {
        last.result = evt.result;
      }
    } else if (evt.type === "text") {
      bubbles.push({ kind: "text", text: evt.text });
    } else if (evt.type === "done") {
      bubbles.push({
        kind: "done",
        success: evt.success,
        result: evt.result,
        order:
          evt.order && typeof evt.order === "object"
            ? (evt.order as Record<string, unknown>)
            : undefined,
      });
    }
  }

  const isRunning = status === "running" || (!done && initialStatus === "running");

  const rateSession = useCallback(
    async (liked: boolean) => {
      setRatingBusy(true);
      try {
        const res = await fetch(`/api/agents/${agentId}/sessions/${taskId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ rating: liked ? "up" : "down" }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error ?? "Failed to save rating");
        }
        setRating(liked);
        onRated?.();
        if (erc8004AgentId != null) {
          const fb = await submitFeedback(erc8004AgentId, liked);
          if (!fb.ok && fb.error) {
            toast.message("Saved locally; on-chain reputation skipped", {
              description: fb.error,
            });
          }
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Rating failed");
      } finally {
        setRatingBusy(false);
      }
    },
    [agentId, taskId, erc8004AgentId, onRated, submitFeedback]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3 shrink-0">
        <p className="text-sm font-medium leading-snug truncate flex-1 mr-3">{task}</p>
        <StatusBadge status={status} />
      </div>

      {/* Bubbles */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3 min-h-0">
        {bubbles.length === 0 && isRunning && <ThinkingIndicator />}

        {bubbles.map((b, i) => {
          if (b.kind === "thinking") return <ThinkingIndicator key={i} />;

          if (b.kind === "tool") {
            return (
              <ToolCallBubble key={i} tool={b.tool} args={b.args} result={b.result} />
            );
          }

          if (b.kind === "text") {
            return (
              <div key={i} className="self-start max-w-[85%]">
                <div className="rounded-2xl rounded-tl-sm border bg-card px-3 py-2 text-sm whitespace-pre-wrap">
                  <span className="text-xs font-medium text-muted-foreground block mb-0.5">
                    agent response
                  </span>
                  {b.text}
                </div>
              </div>
            );
          }

          if (b.kind === "done") {
            const purchase =
              b.success && b.order && b.order.success === true ? b.order : null;
            return (
              <div
                key={i}
                className={cn(
                  "rounded-lg border p-3 text-sm",
                  b.success
                    ? "border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-300"
                    : "border-destructive/30 bg-destructive/10 text-destructive",
                )}
              >
                <span className="font-medium block mb-0.5">
                  {b.success ? "Task complete" : "Task failed"}
                </span>
                {b.result ? (
                  <p className="whitespace-pre-wrap text-green-900/90 dark:text-green-100/90">
                    {b.result}
                  </p>
                ) : null}
                {purchase ? <TaskPurchaseSummary purchase={purchase} /> : null}
              </div>
            );
          }

          return null;
        })}

        {/* Show thinking indicator while running and last event was a tool_result (waiting for next step) */}
        {isRunning && bubbles.length > 0 && bubbles[bubbles.length - 1]?.kind === "tool" && (bubbles[bubbles.length - 1] as { result?: string }).result !== undefined && (
          <ThinkingIndicator />
        )}

        {status === "done" && (
          <div className="flex flex-col gap-2 pt-1 border-t border-dashed mt-1">
            <p className="text-xs text-muted-foreground">Rate this run</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={ratingBusy}
                onClick={() => rateSession(true)}
                className={cn(
                  "inline-flex items-center justify-center rounded-md border p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50",
                  rating === true && "border-primary bg-primary/10 text-primary"
                )}
                title="Good response"
              >
                <ThumbUpIcon size={18} />
              </button>
              <button
                type="button"
                disabled={ratingBusy}
                onClick={() => rateSession(false)}
                className={cn(
                  "inline-flex items-center justify-center rounded-md border p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50",
                  rating === false && "border-destructive/50 bg-destructive/10 text-destructive"
                )}
                title="Poor response"
              >
                <ThumbDownIcon size={18} />
              </button>
              {ratingBusy && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Footer: task id */}
      <div className="border-t px-4 py-2 shrink-0">
        <p className="text-xs text-muted-foreground font-mono select-all">{taskId}</p>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    running: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    done: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
    failed: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  };
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
        styles[status] ?? "bg-muted text-muted-foreground",
      )}
    >
      {status === "running" && (
        <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
      )}
      {status}
    </span>
  );
}
