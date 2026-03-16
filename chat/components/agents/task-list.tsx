"use client";

import useSWR from "swr";
import { TaskCard } from "./task-card";

interface Task {
  id: string;
  task: string;
  status: string;
  result: string | null;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function TaskList({ liveTaskId }: { liveTaskId: string | null }) {
  const { data } = useSWR<{ tasks: Task[] }>("/api/agent/tasks", fetcher, {
    refreshInterval: liveTaskId ? 3000 : 0,
  });

  const tasks = data?.tasks ?? [];

  if (tasks.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        No tasks yet. Dispatch a task above.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {tasks.map((t) => (
        <TaskCard
          key={t.id}
          id={t.id}
          task={t.task}
          initialStatus={t.status}
          live={t.id === liveTaskId}
        />
      ))}
    </div>
  );
}
