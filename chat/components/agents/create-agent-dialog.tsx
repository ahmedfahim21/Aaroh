"use client";

import { useState } from "react";
import { useWallets } from "@privy-io/react-auth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getMasterSignature, deriveAgentAddress } from "@/hooks/use-agent-master-key";

interface CreateAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function CreateAgentDialog({ open, onOpenChange, onCreated }: CreateAgentDialogProps) {
  const { wallets } = useWallets();
  const [name, setName] = useState("");
  const [instructions, setInstructions] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");

  const handleCreate = async () => {
    if (!name.trim()) {
      setError("Name is required.");
      setStatus("error");
      return;
    }

    const wallet = wallets[0];
    if (!wallet) {
      setError("Connect a wallet first (via Privy).");
      setStatus("error");
      return;
    }

    setStatus("loading");
    setError("");

    try {
      const agentId = crypto.randomUUID();
      const sig = await getMasterSignature((opts) =>
        wallet.sign(opts.message)
      );
      const walletAddress = deriveAgentAddress(sig, agentId);

      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: agentId, name: name.trim(), instructions: instructions.trim(), walletAddress }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to create agent");
      }

      setName("");
      setInstructions("");
      setStatus("idle");
      onOpenChange(false);
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setStatus("error");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Agent</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="agent-name">Name</Label>
            <Input
              id="agent-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Shopping Bot"
              disabled={status === "loading"}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="agent-instructions">Instructions (optional)</Label>
            <Textarea
              id="agent-instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Extra instructions for this agent…"
              rows={3}
              disabled={status === "loading"}
            />
          </div>

          {status === "error" && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {wallets.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No wallet connected. Connect via the Privy button to derive an agent key.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={status === "loading"}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={status === "loading"}>
            {status === "loading" ? "Creating…" : "Create Agent"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
