"use client";

import { useState } from "react";
import { useWallets } from "@privy-io/react-auth";
import { cn } from "@/lib/utils";

// USDC on Ethereum Sepolia
const USDC_ADDRESS = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as const;
const ETH_SEPOLIA_CHAIN_ID = 11155111;

export type CheckoutViewData = {
  _ui?: { type: string };
  checkout_session_id?: string;
  /** Order total in USD cents (e.g. 2800 = $28.00 USDC) */
  order_total?: number;
  /** Merchant EVM wallet address to pay */
  wallet_address?: string;
  /** Base URL of the merchant server for completing checkout */
  merchant_url?: string;
  message?: string;
};

type CheckoutViewProps = {
  data: CheckoutViewData;
  className?: string;
};

type PayState = "idle" | "signing" | "submitting" | "success" | "error";

export function CheckoutView({ data, className }: CheckoutViewProps) {
  const { wallets } = useWallets();
  const [payState, setPayState] = useState<PayState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [txInfo, setTxInfo] = useState<string | null>(null);

  const orderCents = data.order_total ?? 0;
  const amountUsdc = orderCents / 100; // cents → USD ≈ USDC
  const merchantWallet = data.wallet_address ?? "";
  const merchantUrl = data.merchant_url ?? "";
  const checkoutId = data.checkout_session_id ?? "";

  const canPay = Boolean(
    wallets.length > 0 && merchantWallet && merchantUrl && checkoutId
  );

  async function handleSignAndPay() {
    setPayState("signing");
    setErrorMsg(null);

    try {
      const wallet = wallets[0];
      const provider = await wallet.getEthereumProvider();

      // Amount in USDC micro-units (6 decimals): cents × 10_000
      const amountMicroUsdc = BigInt(orderCents) * BigInt(10_000);

      // Random 32-byte nonce
      const nonceBytes = new Uint8Array(32);
      crypto.getRandomValues(nonceBytes);
      const nonceHex =
        "0x" +
        Array.from(nonceBytes)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");

      const validBefore = Math.floor(Date.now() / 1000) + 3600;
      const fromAddress = wallet.address;

      const typedData = {
        domain: {
          name: "USD Coin",
          version: "2",
          chainId: ETH_SEPOLIA_CHAIN_ID,
          verifyingContract: USDC_ADDRESS,
        },
        types: {
          TransferWithAuthorization: [
            { name: "from", type: "address" },
            { name: "to", type: "address" },
            { name: "value", type: "uint256" },
            { name: "validAfter", type: "uint256" },
            { name: "validBefore", type: "uint256" },
            { name: "nonce", type: "bytes32" },
          ],
        },
        primaryType: "TransferWithAuthorization",
        message: {
          from: fromAddress,
          to: merchantWallet,
          value: amountMicroUsdc.toString(),
          validAfter: "0",
          validBefore: validBefore.toString(),
          nonce: nonceHex,
        },
      };

      const signature = await provider.request({
        method: "eth_signTypedData_v4",
        params: [fromAddress, JSON.stringify(typedData)],
      });

      const payload = {
        x402Version: 1,
        scheme: "exact",
        network: "eip155:11155111",
        payload: {
          signature,
          authorization: {
            from: fromAddress,
            to: merchantWallet,
            value: amountMicroUsdc.toString(),
            validAfter: "0",
            validBefore: validBefore.toString(),
            nonce: nonceHex,
          },
        },
      };

      const xPayment = btoa(JSON.stringify(payload));

      setPayState("submitting");

      const res = await fetch("/api/checkout/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchant_url: merchantUrl,
          checkout_session_id: checkoutId,
          x_payment: xPayment,
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result?.error ?? `Payment failed (${res.status})`);
      }

      setTxInfo(result?.order?.id ?? "confirmed");
      setPayState("success");
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Payment failed.");
      setPayState("error");
    }
  }

  return (
    <div
      className={cn(
        "rounded-lg border bg-card text-card-foreground shadow-sm overflow-hidden",
        className
      )}
    >
      <div className="border-b bg-muted/30 px-4 py-3">
        <p className="text-muted-foreground text-xs uppercase tracking-wide">
          Pay with USDC
        </p>
        <p className="mt-1 font-semibold text-xl text-foreground">
          {amountUsdc.toFixed(2)} USDC
        </p>
      </div>

      <div className="space-y-3 p-4 text-sm">
        {merchantWallet && (
          <div>
            <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">
              Merchant wallet
            </p>
            <p className="break-all rounded bg-muted/50 px-2 py-1.5 font-mono text-xs text-foreground">
              {merchantWallet}
            </p>
          </div>
        )}

        {data.message && (
          <p className="text-muted-foreground text-xs">{data.message}</p>
        )}

        {payState === "success" ? (
          <div className="rounded-md bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 px-3 py-2 text-green-700 dark:text-green-300 text-sm">
            Payment confirmed{txInfo ? ` — order ${txInfo}` : ""}!
          </div>
        ) : (
          <>
            {payState === "error" && errorMsg && (
              <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-destructive text-xs">
                {errorMsg}
              </div>
            )}
            <button
              onClick={handleSignAndPay}
              disabled={!canPay || payState === "signing" || payState === "submitting"}
              className={cn(
                "w-full rounded-md px-4 py-2 text-sm font-medium transition-colors",
                canPay && payState === "idle"
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : payState === "error"
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "bg-muted text-muted-foreground cursor-not-allowed"
              )}
            >
              {payState === "signing"
                ? "Waiting for signature…"
                : payState === "submitting"
                  ? "Submitting payment…"
                  : !wallets.length
                    ? "Connect wallet to pay"
                    : "Sign & Pay"}
            </button>
            {!wallets.length && (
              <p className="text-center text-muted-foreground text-xs">
                Connect your wallet via the top-right menu to pay with USDC.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
