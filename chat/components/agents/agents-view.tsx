"use client";

import { useState } from "react";
import useSWR from "swr";
import { AgentSetupForm } from "./agent-setup-form";
import { TaskList } from "./task-list";
import { TaskInteraction } from "./task-interaction";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Identity {
  address?: string;
  erc8004?: { agent_id: number | null; network: string };
  payment?: { network: string; usdc_contract: string };
  error?: string;
}

interface SelectedTask {
  id: string;
  task: string;
  status: string;
}

export function AgentsView() {
  const { data: identity } = useSWR<Identity>("/api/agent", fetcher, {
    revalidateOnFocus: false,
  });
  const [liveTaskId, setLiveTaskId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<SelectedTask | null>(null);

  const handleTaskStarted = (taskId: string, taskText: string) => {
    setLiveTaskId(taskId);
    setSelectedTask({ id: taskId, task: taskText, status: "running" });
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left sidebar ───────────────────────────────────── */}
      <div className="flex flex-col w-80 shrink-0 border-r overflow-y-auto">
        {/* Identity strip */}
        {identity && !identity.error && (
          <div className="border-b px-4 py-3 text-xs font-mono space-y-0.5 bg-muted/30">
            <div className="truncate">
              <span className="text-muted-foreground">addr </span>
              <span className="select-all">{identity.address}</span>
            </div>
            {identity.erc8004?.agent_id != null && (
              <div>
                <span className="text-muted-foreground">erc8004 </span>
                <span>#{identity.erc8004.agent_id}</span>
              </div>
            )}
          </div>
        )}

        {/* Dispatch form */}
        <div className="p-4 border-b">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            New task
          </p>
          <AgentSetupFormWrapper onTaskStarted={handleTaskStarted} />
        </div>

        {/* Task history */}
        <div className="flex-1 p-4 overflow-y-auto">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            History
          </p>
          <TaskList
            liveTaskId={liveTaskId}
            selectedTaskId={selectedTask?.id ?? null}
            onSelect={(t) => setSelectedTask(t)}
          />
        </div>
      </div>

      {/* ── Main: interaction viewer ────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedTask ? (
          <TaskInteraction
            key={selectedTask.id}
            taskId={selectedTask.id}
            task={selectedTask.task}
            initialStatus={selectedTask.status}
          />
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );
}

// Thin wrapper to intercept the task text before passing to parent
function AgentSetupFormWrapper({
  onTaskStarted,
}: {
  onTaskStarted: (taskId: string, task: string) => void;
}) {
  const [pendingTask, setPendingTask] = useState("");

  return (
    <div>
      <AgentSetupFormCapture
        onPendingChange={setPendingTask}
        onTaskStarted={(id) => onTaskStarted(id, pendingTask)}
      />
    </div>
  );
}

// AgentSetupForm already manages its own state; we just need the task text
// at the moment of dispatch. Simplest: lift state via a controlled shim.
function AgentSetupFormCapture({
  onPendingChange,
  onTaskStarted,
}: {
  onPendingChange: (task: string) => void;
  onTaskStarted: (taskId: string) => void;
}) {
  return (
    <AgentSetupForm
      onTaskStarted={onTaskStarted}
      onTaskTextChange={onPendingChange}
    />
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center flex-1 text-center px-8">
      <h2 className="font-semibold text-lg">Watch an agent shop</h2>
      <p className="text-sm text-muted-foreground mt-2 max-w-sm">
        Dispatch a task from the left panel. You'll see every step the agent
        takes — browsing, adding to cart, and paying — in real time.
      </p>
    </div>
  );
}
