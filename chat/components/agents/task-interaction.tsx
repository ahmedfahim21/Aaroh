"use client";

import { useEffect, useRef, useState } from "react";
import { useTaskSSE, type AgentEvent } from "@/hooks/use-task-sse";
import { cn } from "@/lib/utils";

interface TaskInteractionProps {
  taskId: string;
  task: string;
  initialStatus: string;
  eventsUrl?: string;
}

// Human-readable tool labels
function toolLabel(tool: string, args: Record<string, unknown>): string {
  switch (tool) {
    case "discover_merchant":
      return `Discovering merchant${args.url ? ` at ${args.url}` : ""}`;
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
    case "checkout_and_pay":
      return "Checking out and paying via x402";
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

export function TaskInteraction({ taskId, task, initialStatus, eventsUrl }: TaskInteractionProps) {
  const { events, done } = useTaskSSE(taskId, eventsUrl);
  const bottomRef = useRef<HTMLDivElement>(null);

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
    | { kind: "done"; success: boolean; result: string };

  const bubbles: Bubble[] = [];
  let pendingTool: { tool: string; args: Record<string, unknown> } | null = null;

  for (const evt of events as AgentEvent[]) {
    if (evt.type === "thinking") {
      bubbles.push({ kind: "thinking" });
    } else if (evt.type === "tool_call") {
      pendingTool = { tool: evt.tool, args: evt.args };
      bubbles.push({ kind: "tool", tool: evt.tool, args: evt.args });
    } else if (evt.type === "tool_result") {
      // Attach result to the last tool bubble
      const last = bubbles[bubbles.length - 1];
      if (last?.kind === "tool") {
        last.result = evt.result;
        pendingTool = null;
      }
    } else if (evt.type === "text") {
      bubbles.push({ kind: "text", text: evt.text });
    } else if (evt.type === "done") {
      bubbles.push({ kind: "done", success: evt.success, result: evt.result });
    }
  }

  const isRunning = status === "running" || (!done && initialStatus === "running");

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
                {b.result}
              </div>
            );
          }

          return null;
        })}

        {/* Show thinking indicator while running and last event was a tool_result (waiting for next step) */}
        {isRunning && bubbles.length > 0 && bubbles[bubbles.length - 1]?.kind === "tool" && (bubbles[bubbles.length - 1] as { result?: string }).result !== undefined && (
          <ThinkingIndicator />
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
