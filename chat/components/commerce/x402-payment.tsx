"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  WalletIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  LoaderIcon,
  CopyIcon,
  CheckIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const USDC_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
});

export type X402PaymentData = {
  _ui?: { type: string };
  checkout_session_id: string;
  order_total: number;
  wallet_address: string;
  message?: string;
};

type PaymentState =
  | "connect-wallet"
  | "sign-payment"
  | "submitting"
  | "success"
  | "error";

type X402PaymentProps = {
  data: X402PaymentData;
  className?: string;
  onComplete?: (paymentProof: string) => void;
};

export function X402Payment({
  data,
  className,
  onComplete,
}: X402PaymentProps) {
  const [state, setState] = useState<PaymentState>("connect-wallet");
  const [walletConnected, setWalletConnected] = useState(false);
  const [connectedAddress, setConnectedAddress] = useState<string>("");
  const [paymentProof, setPaymentProof] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const totalUSDC = data.order_total / 100; // Convert cents to USDC
  const merchantWallet = data.wallet_address;

  useEffect(() => {
    // Check if MetaMask is already connected
    checkWalletConnection();
  }, []);

  const checkWalletConnection = async () => {
    if (typeof window.ethereum !== "undefined") {
      try {
        const accounts = await window.ethereum.request({
          method: "eth_accounts",
        });
        if (accounts.length > 0) {
          setConnectedAddress(accounts[0]);
          setWalletConnected(true);
          setState("sign-payment");
        }
      } catch (err) {
        console.error("Failed to check wallet:", err);
      }
    }
  };

  const connectWallet = async () => {
    if (typeof window.ethereum === "undefined") {
      setError("MetaMask is not installed. Please install MetaMask to continue.");
      setState("error");
      return;
    }

    try {
      setState("connect-wallet");
      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });

      if (accounts.length > 0) {
        setConnectedAddress(accounts[0]);
        setWalletConnected(true);
        setState("sign-payment");
        setError("");
      }
    } catch (err: any) {
      setError(err.message || "Failed to connect wallet");
      setState("error");
    }
  };

  const signPayment = async () => {
    if (!walletConnected) {
      setError("Please connect your wallet first");
      return;
    }

    try {
      setState("sign-payment");
      setError("");

      // Build EIP-3009 authorization message
      // This is a simplified version - in production, you'd need:
      // 1. USDC contract address on Base
      // 2. Proper nonce from contract
      // 3. Expiry timestamp
      // 4. validAfter/validBefore values

      const message = {
        from: connectedAddress,
        to: merchantWallet,
        value: (totalUSDC * 1e6).toString(), // USDC has 6 decimals
        validAfter: Math.floor(Date.now() / 1000),
        validBefore: Math.floor(Date.now() / 1000) + 3600, // 1 hour
        nonce: `0x${Math.random().toString(16).slice(2, 34).padStart(32, "0")}`,
      };

      // In production, this would be EIP-712 typed data signing
      // For now, we'll use a simple signature
      const signature = await window.ethereum.request({
        method: "personal_sign",
        params: [JSON.stringify(message), connectedAddress],
      });

      // Create X-PAYMENT header value (base64 encoded)
      const xPaymentValue = btoa(
        JSON.stringify({
          ...message,
          signature,
        })
      );

      setPaymentProof(xPaymentValue);
      setState("submitting");

      // Auto-submit payment
      if (onComplete) {
        await onComplete(xPaymentValue);
        setState("success");
      }
    } catch (err: any) {
      if (err.code === 4001) {
        setError("Payment signature rejected");
      } else {
        setError(err.message || "Failed to sign payment");
      }
      setState("error");
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={cn(
        "rounded-lg border bg-card text-card-foreground shadow-sm overflow-hidden",
        className
      )}
    >
      <div className="border-b bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-2">
          <WalletIcon className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm">Crypto Payment (Base USDC)</span>
        </div>
        <p className="mt-2 font-semibold text-2xl text-foreground">
          {USDC_FORMATTER.format(totalUSDC)}
        </p>
      </div>

      <div className="space-y-4 p-6">
        {/* Wallet Connection */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">1. Connect Wallet</span>
            {walletConnected && (
              <Badge variant="default" className="gap-1">
                <CheckCircleIcon className="h-3 w-3" />
                Connected
              </Badge>
            )}
          </div>

          {!walletConnected ? (
            <Button
              onClick={connectWallet}
              className="w-full gap-2"
              disabled={state === "connect-wallet"}
            >
              <WalletIcon className="h-4 w-4" />
              Connect MetaMask
            </Button>
          ) : (
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Connected Address</p>
              <div className="mt-1 flex items-center gap-2">
                <code className="flex-1 truncate text-xs font-mono">
                  {connectedAddress}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  onClick={() => copyToClipboard(connectedAddress)}
                >
                  {copied ? (
                    <CheckIcon className="h-3 w-3" />
                  ) : (
                    <CopyIcon className="h-3 w-3" />
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Payment Authorization */}
        {walletConnected && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">2. Authorize Payment</span>
              {state === "success" && (
                <Badge variant="default" className="gap-1">
                  <CheckCircleIcon className="h-3 w-3" />
                  Signed
                </Badge>
              )}
            </div>

            <div className="rounded-md border bg-muted/30 p-3 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Amount:</span>
                <span className="font-mono font-medium">{totalUSDC.toFixed(6)} USDC</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">To:</span>
                <code className="font-mono text-xs truncate max-w-[180px]">
                  {merchantWallet}
                </code>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Network:</span>
                <span className="font-medium">Base</span>
              </div>
            </div>

            {state === "sign-payment" && (
              <Button
                onClick={signPayment}
                className="w-full gap-2"
                size="lg"
              >
                Sign Payment Authorization
              </Button>
            )}

            {state === "submitting" && (
              <Button className="w-full gap-2" size="lg" disabled>
                <LoaderIcon className="h-4 w-4 animate-spin" />
                Processing Payment...
              </Button>
            )}

            {state === "success" && (
              <Alert className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950">
                <CheckCircleIcon className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800 dark:text-green-200">
                  Payment authorized successfully! Processing order...
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* Error State */}
        {error && state === "error" && (
          <Alert variant="destructive">
            <AlertCircleIcon className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Info Message */}
        {data.message && !error && (
          <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 p-3">
            <p className="text-xs text-blue-800 dark:text-blue-200">
              {data.message}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// Type declaration for window.ethereum
declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: any[] }) => Promise<any>;
      isMetaMask?: boolean;
    };
  }
}
