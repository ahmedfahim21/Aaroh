"use client";

import { useState } from "react";
import { useSendTransaction, useWallets } from "@privy-io/react-auth";
import {
  encodeFunctionData,
  erc20Abi,
  parseEther,
  parseUnits,
  getAddress,
  isAddress,
} from "viem";
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
import {
  BASE_SEPOLIA_CHAIN_ID,
  USDC_BASE_SEPOLIA_ADDRESS,
} from "@/lib/constants";
import { cn } from "@/lib/utils";

type FundMode = "usdc" | "eth";

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
  const { sendTransaction } = useSendTransaction();
  const [mode, setMode] = useState<FundMode>("usdc");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState("");
  const [txHash, setTxHash] = useState<string | null>(null);

  const handleFund = async () => {
    const wallet = wallets.find((w) => isAddress(w.address));
    if (!wallet) {
      setError("Connect a wallet first.");
      setStatus("error");
      return;
    }
    const parsed = Number.parseFloat(amount);
    if (Number.isNaN(parsed) || parsed <= 0) {
      setError(
        mode === "eth"
          ? "Enter a valid ETH amount."
          : "Enter a valid USDC amount.",
      );
      setStatus("error");
      return;
    }
    if (!isAddress(agentAddress)) {
      setError("Invalid agent address.");
      setStatus("error");
      return;
    }

    setStatus("loading");
    setError("");
    setTxHash(null);

    try {
      const toAddress = getAddress(agentAddress);

      if (mode === "eth") {
        const value = parseEther(amount);
        const { hash } = await sendTransaction(
          {
            to: toAddress,
            value,
            chainId: BASE_SEPOLIA_CHAIN_ID,
          },
          {
            address: wallet.address,
          },
        );
        setTxHash(hash);
      } else {
        const data = encodeFunctionData({
          abi: erc20Abi,
          functionName: "transfer",
          args: [toAddress, parseUnits(amount, 6)],
        });

        const { hash } = await sendTransaction(
          {
            to: USDC_BASE_SEPOLIA_ADDRESS,
            data,
            chainId: BASE_SEPOLIA_CHAIN_ID,
          },
          {
            address: wallet.address,
          },
        );
        setTxHash(hash);
      }

      setStatus("success");
      onFunded?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transaction failed");
      setStatus("error");
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Fund {agentName}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <p className="text-sm text-muted-foreground font-mono break-all">{agentAddress}</p>

          <div className="flex rounded-md border p-0.5 bg-muted/40">
            <button
              className={cn(
                "flex-1 rounded px-2 py-1.5 text-xs font-medium transition-colors",
                mode === "usdc" ? "bg-background shadow-sm" : "text-muted-foreground",
              )}
              onClick={() => setMode("usdc")}
              type="button"
            >
              USDC
            </button>
            <button
              className={cn(
                "flex-1 rounded px-2 py-1.5 text-xs font-medium transition-colors",
                mode === "eth" ? "bg-background shadow-sm" : "text-muted-foreground",
              )}
              onClick={() => setMode("eth")}
              type="button"
            >
              ETH (gas)
            </button>
          </div>
          {mode === "eth" && (
            <p className="text-xs text-muted-foreground">
              Send a small amount of Base Sepolia ETH so the agent can pay gas for EIP-8004
              registration and on-chain actions.
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fund-amount">{mode === "eth" ? "ETH amount" : "USDC amount"}</Label>
            <Input
              disabled={status === "loading"}
              id="fund-amount"
              type="number"
              min="0"
              step={mode === "eth" ? "0.0001" : "0.01"}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={mode === "eth" ? "e.g. 0.002" : "e.g. 10.00"}
            />
          </div>

          {status === "success" && (
            <p className="text-sm text-green-700 dark:text-green-400">
              Transaction submitted!
              {txHash ? (
                <span className="block mt-1 font-mono text-xs text-green-800 dark:text-green-300 break-all">
                  {txHash}
                </span>
              ) : null}
            </p>
          )}
          {status === "error" && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button
            disabled={status === "loading"}
            onClick={() => onOpenChange(false)}
            variant="outline"
          >
            Cancel
          </Button>
          <Button disabled={status === "loading" || !amount} onClick={handleFund}>
            {status === "loading" ? "Sending…" : mode === "eth" ? "Send ETH" : "Send USDC"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
