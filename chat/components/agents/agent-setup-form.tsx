"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface AgentSetupFormProps {
  onTaskStarted: (taskId: string) => void;
  onTaskTextChange?: (task: string) => void;
}

export function AgentSetupForm({ onTaskStarted, onTaskTextChange }: AgentSetupFormProps) {
  const [task, setTask] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!task.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: task.trim() }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      onTaskStarted(data.task_id);
      setTask("");
      onTaskTextChange?.("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start task");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="task">Task</Label>
        <Textarea
          id="task"
          placeholder="e.g. Buy the cheapest candle you can find"
          rows={3}
          value={task}
          onChange={(e) => {
            setTask(e.target.value);
            onTaskTextChange?.(e.target.value);
          }}
          disabled={loading}
          required
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={loading || !task.trim()} className="w-full">
        {loading ? "Dispatching…" : "Dispatch Agent"}
      </Button>
    </form>
  );
}
