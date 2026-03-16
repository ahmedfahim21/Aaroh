"use client";

import { useTaskSSE } from "@/hooks/use-task-sse";
import { cn } from "@/lib/utils";

interface TaskCardProps {
  id: string;
  task: string;
  initialStatus: string;
  live?: boolean;
}

const EVENT_ICON: Record<string, string> = {
  thinking: "🤔",
  tool_call: "🔧",
  tool_result: "📦",
  text: "💬",
  log: "📋",
  done: "✅",
};

function statusBadge(status: string) {
  const map: Record<string, string> = {
    running: "bg-blue-100 text-blue-700",
    done: "bg-green-100 text-green-700",
    failed: "bg-red-100 text-red-700",
  };
  return map[status] ?? "bg-gray-100 text-gray-600";
}

export function TaskCard({ id, task, initialStatus, live = false }: TaskCardProps) {
  const { events, done } = useTaskSSE(live ? id : null);

  const status =
    live && done
      ? events.some((e) => e.type === "done" && !(e as { success: boolean }).success)
        ? "failed"
        : "done"
      : initialStatus;

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium leading-snug">{task}</p>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
            statusBadge(status),
          )}
        >
          {status}
        </span>
      </div>

      {events.length > 0 && (
        <div className="space-y-1 max-h-64 overflow-y-auto rounded-md bg-muted/50 p-2 text-xs font-mono">
          {events.map((evt, i) => {
            const icon = EVENT_ICON[evt.type] ?? "•";
            let label: string = evt.type;
            if (evt.type === "tool_call") label = `→ ${evt.tool}(${JSON.stringify(evt.args).slice(0, 80)})`;
            else if (evt.type === "tool_result") label = `← ${evt.tool}: ${evt.result.slice(0, 120)}`;
            else if (evt.type === "text") label = evt.text.slice(0, 200);
            else if (evt.type === "log") label = `[${evt.level}] ${evt.msg}`;
            else if (evt.type === "done") label = evt.result.slice(0, 200);
            return (
              <div key={i} className="flex gap-1.5 leading-relaxed">
                <span>{icon}</span>
                <span className="text-muted-foreground break-all">{label}</span>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-muted-foreground font-mono select-all">{id}</p>
    </div>
  );
}
