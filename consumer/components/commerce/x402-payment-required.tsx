"use client";

import { cn } from "@/lib/utils";

export type X402PaymentRequiredData = {
  _ui?: { type: string };
  x402?: string;
  checkout_session_id?: string;
  order_total_cents?: number;
  pay_to?: string;
  amount_micro_usdc?: string;
  network?: string;
  asset?: string;
  message?: string;
};

type X402PaymentRequiredProps = {
  data: X402PaymentRequiredData;
  className?: string;
};

function formatUsdc(amountMicroUsdc?: string): string {
  const numeric = Number.parseInt(amountMicroUsdc ?? "0", 10);
  if (Number.isNaN(numeric)) return "0.00";
  return (numeric / 1_000_000).toFixed(2);
}

export function X402PaymentRequired({ data, className }: X402PaymentRequiredProps) {
  const totalCents = data.order_total_cents ?? 0;

  return (
    <div
      className={cn(
        "rounded-lg border bg-card text-card-foreground shadow-sm overflow-hidden",
        className
      )}
    >
      <div className="border-b bg-muted/30 px-4 py-3">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">x402 Payment Required</p>
        <p className="mt-1 text-sm font-medium text-foreground">
          {formatUsdc(data.amount_micro_usdc)} USDC
        </p>
      </div>

      <div className="space-y-2 p-4 text-sm">
        {data.message ? <p className="text-xs text-muted-foreground">{data.message}</p> : null}
        <p className="text-xs text-muted-foreground">
          Checkout total: ${(totalCents / 100).toFixed(2)}
        </p>
        {data.pay_to ? (
          <p className="break-all rounded bg-muted/50 px-2 py-1.5 font-mono text-xs text-foreground">
            payTo: {data.pay_to}
          </p>
        ) : null}
        <div className="grid grid-cols-1 gap-2 text-xs text-muted-foreground md:grid-cols-2">
          <p>network: {data.network ?? "-"}</p>
          <p>asset: {data.asset ?? "-"}</p>
        </div>
      </div>
    </div>
  );
}
