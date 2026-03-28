"use client";

import { CheckCircleIcon, ExternalLinkIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  extractTxHashFromCheckout,
  lineItemsFromCheckout,
  orderIdFromCheckout,
  totalCentsFromCheckout,
  txExplorerUrl,
} from "@/lib/checkout-receipt";

export type CartSummaryItem = {
  title: string;
  quantity: number;
  price_cents?: number;
  line_total_cents?: number;
};

export type OrderConfirmationData = {
  _ui?: { type: string };
  success?: boolean;
  order_id?: string;
  order_url?: string;
  tx_hash?: string;
  /** Canonical x402 SettlementResponse.transaction from merchant complete body */
  x402_transaction?: string;
  tx_url?: string;
  message?: string;
  cart_summary?: {
    items?: CartSummaryItem[];
    total_cents?: number;
  };
  /** Full merchant checkout JSON (fallback for line items / tx) */
  order?: Record<string, unknown>;
};

type OrderConfirmationProps = {
  data: OrderConfirmationData;
  className?: string;
};

function formatUsdFromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function OrderConfirmation({ data, className }: OrderConfirmationProps) {
  const success = data.success !== false;

  const nestedCheckout = data.order;
  const orderId =
    data.order_id ?? (nestedCheckout ? orderIdFromCheckout(nestedCheckout) : undefined);

  const txHash =
    extractTxHashFromCheckout(data) ??
    (nestedCheckout ? extractTxHashFromCheckout(nestedCheckout) : undefined);
  const txUrl = data.tx_url ?? txExplorerUrl(txHash);

  const cartItems = data.cart_summary?.items?.length
    ? data.cart_summary.items.map((it) => ({
        title: it.title,
        quantity: it.quantity,
        lineTotalCents:
          it.line_total_cents ??
          (it.price_cents != null ? it.price_cents * it.quantity : 0),
      }))
    : nestedCheckout
      ? lineItemsFromCheckout(nestedCheckout).map((it) => ({
          title: it.title,
          quantity: it.quantity,
          lineTotalCents: it.lineTotalCents,
        }))
      : [];

  const totalCents =
    data.cart_summary?.total_cents ??
    (nestedCheckout ? totalCentsFromCheckout(nestedCheckout) : undefined);

  const message = data.message ?? "Thank you for your payment.";

  return (
    <div
      className={cn(
        "rounded-lg border bg-card text-card-foreground shadow-sm overflow-hidden",
        className
      )}
    >
      <div className="flex flex-col gap-4 p-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div
            className={cn(
              "flex size-12 items-center justify-center rounded-full",
              success
                ? "bg-green-100 text-green-600 dark:bg-green-950/50"
                : "bg-muted text-muted-foreground"
            )}
          >
            <CheckCircleIcon className="size-7" />
          </div>
          <p className="text-muted-foreground text-sm">{message}</p>
        </div>

        {txHash ? (
          <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm dark:border-green-800 dark:bg-green-950/40">
            <p className="text-xs font-medium uppercase tracking-wide text-green-800 dark:text-green-300">
              Transaction Details
            </p>
            <p className="mt-2 text-xs font-medium uppercase tracking-wide text-green-800/90 dark:text-green-300/90">
              Transaction ID
            </p>
            <p className="mt-0.5 break-all font-mono text-xs text-green-900 dark:text-green-100">
              {txHash}
            </p>
            {txUrl ? (
              <a
                href={txUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 font-mono text-xs font-medium text-green-700 underline-offset-2 hover:underline dark:text-green-200"
              >
                View on Base Sepolia (block explorer)
                <ExternalLinkIcon className="size-3.5 shrink-0" />
              </a>
            ) : null}
          </div>
        ) : (
          <p className="rounded-md border border-amber-200/80 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
            No on-chain transaction in this response. Ensure the merchant returns
            PAYMENT-RESPONSE or <code className="rounded bg-amber-100/80 px-0.5 dark:bg-amber-900/40">x402_transaction</code> on checkout complete.
          </p>
        )}

        {orderId && (
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Order reference
            </p>
            <p className="mt-1 break-all font-mono text-xs text-foreground">{orderId}</p>
          </div>
        )}

        {cartItems.length > 0 && (
          <div className="space-y-2 border-t pt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Items
            </p>
            <ul className="space-y-2 text-sm">
              {cartItems.map((it, i) => (
                <li
                  key={`${it.title}-${i}`}
                  className="flex justify-between gap-2 border-b border-border/50 pb-2 last:border-0 last:pb-0"
                >
                  <span className="text-foreground">
                    {it.title}
                    {it.quantity > 1 ? (
                      <span className="text-muted-foreground"> ×{it.quantity}</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    ${formatUsdFromCents(it.lineTotalCents)}
                  </span>
                </li>
              ))}
            </ul>
            {totalCents != null && (
              <p className="flex justify-between border-t pt-2 text-sm font-semibold text-foreground">
                <span>Total</span>
                <span className="tabular-nums">${formatUsdFromCents(totalCents)}</span>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
