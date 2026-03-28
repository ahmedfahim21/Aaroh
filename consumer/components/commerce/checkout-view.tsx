"use client";

import { useEffect, useState } from "react";
import { useWallets } from "@privy-io/react-auth";
import { ExternalLinkIcon } from "lucide-react";
import { createWalletClient, custom, getAddress, isAddress } from "viem";
import { baseSepolia } from "viem/chains";
import {
  extractTxHashFromCheckout,
  lineItemsFromCheckout,
  orderIdFromCheckout,
  totalCentsFromCheckout,
  txExplorerUrl,
} from "@/lib/checkout-receipt";
import { cn } from "@/lib/utils";
import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_CHAIN_ID_HEX,
  USDC_BASE_SEPOLIA_ADDRESS,
} from "@/lib/constants";

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

type WalletRpcErrorLike = {
  code?: number;
  message?: string;
  shortMessage?: string;
  details?: string;
  data?: unknown;
};

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

function formatUsdFromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

function CheckoutSuccessSummary({ receipt }: { receipt: Record<string, unknown> | null }) {
  const txHash = receipt ? extractTxHashFromCheckout(receipt) : undefined;
  const txUrl = txExplorerUrl(txHash);
  const orderId = receipt ? orderIdFromCheckout(receipt) : undefined;
  const lines = receipt ? lineItemsFromCheckout(receipt) : [];
  const totalCents = receipt ? totalCentsFromCheckout(receipt) : undefined;

  return (
    <div className="space-y-3 rounded-md border border-green-200 bg-green-50 px-3 py-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-950/50 dark:text-green-200">
      <p className="font-medium text-green-900 dark:text-green-100">Payment confirmed</p>

      {txUrl ? (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-green-800/90 dark:text-green-300/90">
            Blockchain proof
          </p>
          <a
            href={txUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-0.5 inline-flex items-center gap-1 break-all font-mono text-xs underline-offset-2 hover:underline"
          >
            View transaction on Base Sepolia
            <ExternalLinkIcon className="size-3.5 shrink-0" />
          </a>
        </div>
      ) : (
        <p className="text-xs text-amber-800 dark:text-amber-200/90">
          On-chain transaction link unavailable for this checkout. Check agent or merchant
          logs for settlement details.
        </p>
      )}

      {orderId && (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-green-800/90 dark:text-green-300/90">
            Order reference
          </p>
          <p className="mt-0.5 font-mono text-xs text-green-800/80 dark:text-green-300/80 break-all">
            {orderId}
          </p>
        </div>
      )}

      {lines.length > 0 && (
        <div className="border-t border-green-200/80 pt-2 dark:border-green-800/80">
          <p className="text-xs font-medium uppercase tracking-wide text-green-800/90 dark:text-green-300/90">
            Items
          </p>
          <ul className="mt-1 space-y-1.5">
            {lines.map((it, i) => (
              <li
                key={`${it.title}-${i}`}
                className="flex justify-between gap-2 text-xs"
              >
                <span>
                  {it.title}
                  {it.quantity > 1 ? (
                    <span className="text-green-800/70 dark:text-green-300/70">
                      {" "}
                      ×{it.quantity}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 tabular-nums">
                  ${formatUsdFromCents(it.lineTotalCents)}
                </span>
              </li>
            ))}
          </ul>
          {totalCents != null && (
            <p className="mt-2 flex justify-between border-t border-green-200/80 pt-2 text-xs font-semibold dark:border-green-800/80">
              <span>Total</span>
              <span className="tabular-nums">${formatUsdFromCents(totalCents)}</span>
            </p>
          )}
        </div>
      )}

      {!txUrl && lines.length === 0 && (
        <p className="text-xs text-green-800/80 dark:text-green-300/80">
          Your order is complete. You can review purchases under Transactions when enabled.
        </p>
      )}
    </div>
  );
}

function normalizeWalletError(error: unknown): {
  code?: number;
  message: string;
  details?: string;
} {
  if (error && typeof error === "object") {
    const err = error as WalletRpcErrorLike;
    const message =
      err.shortMessage ??
      err.message ??
      (error instanceof Error ? error.message : "Wallet request failed.");
    const details =
      typeof err.details === "string"
        ? err.details
        : typeof err.data === "string"
          ? err.data
          : undefined;
    return { code: err.code, message, details };
  }
  return {
    message: error instanceof Error ? error.message : "Wallet request failed.",
  };
}


export function CheckoutView({ data, className }: CheckoutViewProps) {
  const { wallets } = useWallets();
  const [payState, setPayState] = useState<PayState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  /** Merchant checkout JSON after pay or status hydrate */
  const [completedReceipt, setCompletedReceipt] = useState<Record<
    string,
    unknown
  > | null>(null);

  const orderCents = data.order_total ?? 0;
  const amountUsdc = orderCents / 100; // cents → USD ≈ USDC
  const merchantWallet = data.wallet_address ?? "";
  const hasValidMerchantWallet = isAddress(merchantWallet);
  const merchantUrl = data.merchant_url ?? "";
  const checkoutId = data.checkout_session_id ?? "";

  useEffect(() => {
    if (!merchantUrl || !checkoutId) return;

    const controller = new AbortController();
    const params = new URLSearchParams({
      merchant_url: merchantUrl,
      checkout_session_id: checkoutId,
    });

    fetch(`/api/checkout/status?${params.toString()}`, {
      signal: controller.signal,
    })
      .then(async (r) => {
        if (!r.ok) return null;
        return r.json() as Promise<{
          completed?: boolean;
          order_id?: string | null;
          checkout?: Record<string, unknown>;
        }>;
      })
      .then((body) => {
        if (!body) return;
        if (body.completed) {
          setPayState("success");
          if (body.checkout && typeof body.checkout === "object") {
            setCompletedReceipt(body.checkout);
          } else if (body.order_id) {
            setCompletedReceipt({
              order: { id: body.order_id },
            });
          }
        }
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;
        if (process.env.NODE_ENV !== "production") {
          console.error("Checkout status fetch failed:", err);
        }
      });

    return () => {
      controller.abort();
    };
  }, [merchantUrl, checkoutId]);

  const canPay = Boolean(
    wallets.length > 0 &&
      hasValidMerchantWallet &&
      merchantUrl &&
      checkoutId
  );

  async function handleSignAndPay() {
    setPayState("signing");
    setErrorMsg(null);
    let debugFromAddress: string | undefined;

    try {
      if (!hasValidMerchantWallet) {
        throw new Error(
          "Merchant wallet is not configured correctly. Expected a valid 0x EVM address."
        );
      }

      const wallet = wallets.find((candidate) => isAddress(candidate.address));
      if (!wallet) {
        throw new Error("Connect an EVM wallet before signing payment.");
      }

      const provider = (await wallet.getEthereumProvider()) as EthereumProvider;
      const walletAddress = getAddress(wallet.address);

      const connectedAccountsResult = await provider.request({
        method: "eth_accounts",
      });
      const connectedAccounts = Array.isArray(connectedAccountsResult)
        ? connectedAccountsResult.filter(
            (account): account is string =>
              typeof account === "string" && isAddress(account)
          )
        : [];

      const matchedConnectedAccount = connectedAccounts.find(
        (account) => getAddress(account) === walletAddress
      );

      const requestedAccountsResult = await provider.request({
        method: "eth_requestAccounts",
      });
      const requestedAccounts = Array.isArray(requestedAccountsResult)
        ? requestedAccountsResult.filter(
            (account): account is string =>
              typeof account === "string" && isAddress(account)
          )
        : [];

      const matchedRequestedAccount = requestedAccounts.find(
        (account) => getAddress(account) === walletAddress
      );

      if (!matchedRequestedAccount) {
        throw new Error(
          "Connected wallet account does not match the selected signer. In MetaMask, switch to the connected account and try again."
        );
      }

      const rawFromAddress =
        matchedConnectedAccount ?? matchedRequestedAccount ?? walletAddress;
      const fromAddress = getAddress(rawFromAddress);
      debugFromAddress = fromAddress;
      const toAddress = getAddress(merchantWallet);

      // Best-effort switch to Base Sepolia for consistent wallet behavior.
      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: BASE_SEPOLIA_CHAIN_ID_HEX }],
        });
      } catch (chainError) {
        // Ignore and continue; typed data includes explicit chainId anyway.
        if (process.env.NODE_ENV !== "production") {
          console.warn("Sign & Pay chain switch failed", {
            error: normalizeWalletError(chainError),
            targetChainId: BASE_SEPOLIA_CHAIN_ID,
          });
        }
      }

      // Amount in USDC micro-units (6 decimals): cents × 10_000
      const amountMicroUsdc = BigInt(orderCents) * BigInt(10_000);

      // Random 32-byte nonce
      const nonceBytes = new Uint8Array(32);
      crypto.getRandomValues(nonceBytes);
      const nonceHex = ("0x" +
        Array.from(nonceBytes)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("")) as `0x${string}`;

      const validBefore = BigInt(Math.floor(Date.now() / 1000) + 3600);

      // Use viem walletClient.signTypedData — handles EIP-712 encoding correctly
      // and works reliably with Privy's EIP-1193 provider.
      const walletClient = createWalletClient({
        account: fromAddress as `0x${string}`,
        chain: baseSepolia,
        transport: custom(provider),
      });

      const signature = await walletClient.signTypedData({
        domain: {
          name: "USDC",
          version: "2",
          chainId: BASE_SEPOLIA_CHAIN_ID,
          verifyingContract: getAddress(USDC_BASE_SEPOLIA_ADDRESS),
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
          from: fromAddress as `0x${string}`,
          to: toAddress as `0x${string}`,
          value: amountMicroUsdc,
          validAfter: 0n,
          validBefore,
          nonce: nonceHex,
        },
      });

      const payload = {
        x402Version: 2,
        scheme: "exact",
        network: "eip155:84532",
        payload: {
          signature,
          authorization: {
            from: fromAddress,
            to: toAddress,
            value: amountMicroUsdc.toString(),
            validAfter: "0",
            validBefore: validBefore.toString(),
            nonce: nonceHex,
          },
        },
        accepted: {
          scheme: "exact",
          network: "eip155:84532",
          payTo: toAddress,
          amount: amountMicroUsdc.toString(),
          asset: USDC_BASE_SEPOLIA_ADDRESS,
          maxTimeoutSeconds: 300,
          extra: {
            name: "USDC",
            version: "2",
            assetTransferMethod: "eip3009",
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
        const detail = result?.detail;
        const detailStr = detail
          ? typeof detail === "string"
            ? detail
            : JSON.stringify(detail)
          : null;
        throw new Error(
          detailStr
            ? `${result?.error ?? "Payment failed"}: ${detailStr}`
            : result?.error ?? `Payment failed (${res.status})`
        );
      }

      setCompletedReceipt(
        result && typeof result === "object"
          ? (result as Record<string, unknown>)
          : null
      );
      setPayState("success");
    } catch (err: unknown) {
      const normalized = normalizeWalletError(err);
      const detailSuffix = normalized.details ? ` — ${normalized.details}` : "";
      const codePrefix =
        typeof normalized.code === "number"
          ? `Payment failed (code ${normalized.code}): `
          : "Payment failed: ";
      setErrorMsg(`${codePrefix}${normalized.message}${detailSuffix}`);

      if (process.env.NODE_ENV !== "production") {
        console.error("Sign & Pay failed", {
          error: normalized,
          rawError: err,
          context: {
            checkoutId,
            merchantUrl,
            merchantWallet,
            orderCents,
            fromAddress: debugFromAddress,
            chainId: BASE_SEPOLIA_CHAIN_ID,
            usdcContract: USDC_BASE_SEPOLIA_ADDRESS,
          },
        });
      }
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
          <CheckoutSuccessSummary receipt={completedReceipt} />
        ) : (
          <>
            {payState === "error" && errorMsg && (
              <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-destructive text-xs">
                {errorMsg}
              </div>
            )}
            {!hasValidMerchantWallet && (
              <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-destructive text-xs">
                Merchant wallet is invalid (`{merchantWallet || "empty"}`).
                Set `payment.handlers[].config.wallet_address` in the merchant `discovery_profile.json`
                (or `MERCHANT_WALLET` env override) to a real 0x address.
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
