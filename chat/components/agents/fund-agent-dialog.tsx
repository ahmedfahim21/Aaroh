"use client";

import { useState } from "react";
import { useWallets } from "@privy-io/react-auth";
import { encodeFunctionData, erc20Abi, parseUnits } from "viem";
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

const USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as const;

interface FundAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentAddress: `0x${string}`;
  agentName: string;
  onFunded?: () => void;
}

export function FundAgentDialog({
  open,
  onOpenChange,
  agentAddress,
  agentName,
  onFunded,
}: FundAgentDialogProps) {
  const { wallets } = useWallets();
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState("");

  const handleFund = async () => {
    const wallet = wallets[0];
    if (!wallet) {
      setError("Connect a wallet first.");
      setStatus("error");
      return;
    }
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) {
      setError("Enter a valid USDC amount.");
      setStatus("error");
      return;
    }

    setStatus("loading");
    setError("");

    try {
      const data = encodeFunctionData({
        abi: erc20Abi,
        functionName: "transfer",
        args: [agentAddress, parseUnits(amount, 6)],
      });

      // @privy-io/react-auth wallet.sendTransaction
      const provider = await wallet.getEthereumProvider();
      await provider.request({
        method: "eth_sendTransaction",
        params: [{ to: USDC, data, from: wallet.address }],
      });

      setStatus("success");
      onFunded?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transaction failed");
      setStatus("error");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Fund {agentName}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <p className="text-sm text-muted-foreground font-mono break-all">{agentAddress}</p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fund-amount">USDC amount</Label>
            <Input
              id="fund-amount"
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 10.00"
              disabled={status === "loading"}
            />
          </div>

          {status === "success" && (
            <p className="text-sm text-green-700 dark:text-green-400">Transaction submitted!</p>
          )}
          {status === "error" && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={status === "loading"}>
            Cancel
          </Button>
          <Button onClick={handleFund} disabled={status === "loading" || !amount}>
            {status === "loading" ? "Sending…" : "Send USDC"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
