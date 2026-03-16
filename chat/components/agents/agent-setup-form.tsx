"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface AgentSetupFormProps {
  onTaskStarted: (taskId: string) => void;
}

export function AgentSetupForm({ onTaskStarted }: AgentSetupFormProps) {
  const [task, setTask] = useState("");
  const [merchantUrl, setMerchantUrl] = useState("");
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
        body: JSON.stringify({
          task: task.trim(),
          merchant_url: merchantUrl.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      onTaskStarted(data.task_id);
      setTask("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start task");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="task">Shopping task</Label>
        <Textarea
          id="task"
          placeholder="e.g. Buy the cheapest candle from the artisan store"
          rows={3}
          value={task}
          onChange={(e) => setTask(e.target.value)}
          disabled={loading}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="merchant_url">
          Merchant URL{" "}
          <span className="text-muted-foreground font-normal">(optional override)</span>
        </Label>
        <Input
          id="merchant_url"
          placeholder="http://localhost:8000"
          value={merchantUrl}
          onChange={(e) => setMerchantUrl(e.target.value)}
          disabled={loading}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={loading || !task.trim()} className="w-full">
        {loading ? "Dispatching…" : "Dispatch Agent"}
      </Button>
    </form>
  );
}
