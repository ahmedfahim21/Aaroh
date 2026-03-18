"use client";

import useSWR from "swr";
import { cn } from "@/lib/utils";

interface Task {
  id: string;
  task: string;
  status: string;
  result: string | null;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const STATUS_DOT: Record<string, string> = {
  running: "bg-blue-500 animate-pulse",
  done: "bg-green-500",
  failed: "bg-red-500",
};

interface TaskListProps {
  liveTaskId: string | null;
  selectedTaskId: string | null;
  onSelect: (task: Task) => void;
}

export function TaskList({ liveTaskId, selectedTaskId, onSelect }: TaskListProps) {
  const { data } = useSWR<{ tasks: Task[] }>("/api/agent/tasks", fetcher, {
    refreshInterval: liveTaskId ? 5000 : 0,
  });

  const tasks = data?.tasks ?? [];

  if (tasks.length === 0) {
    return (
      <p className="text-xs text-muted-foreground text-center py-6">
        No tasks yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {tasks.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onSelect(t)}
          className={cn(
            "flex items-start gap-2.5 rounded-md px-3 py-2.5 text-left text-sm transition-colors w-full",
            selectedTaskId === t.id
              ? "bg-accent text-accent-foreground"
              : "hover:bg-muted/50",
          )}
        >
          <span
            className={cn(
              "mt-1.5 h-1.5 w-1.5 rounded-full shrink-0",
              STATUS_DOT[t.status] ?? "bg-muted-foreground",
            )}
          />
          <span className="line-clamp-2 leading-snug flex-1">{t.task}</span>
        </button>
      ))}
    </div>
  );
}
