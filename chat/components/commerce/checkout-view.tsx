"use client";

import { cn } from "@/lib/utils";

const USDC = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export type CheckoutViewData = {
  _ui?: { type: string };
  checkout_session_id?: string;
  order_total: number;  // USD cents
  wallet_address?: string;
  message?: string;
};

type CheckoutViewProps = {
  data: CheckoutViewData;
  className?: string;
};

export function CheckoutView({ data, className }: CheckoutViewProps) {
  const totalCents = data.order_total ?? 0;

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
          {USDC.format(totalCents / 100)}
        </p>
      </div>
      <div className="p-4 space-y-2 text-sm">
        {data.wallet_address && (
          <div>
            <p className="text-muted-foreground text-xs mb-1">Merchant wallet</p>
            <p className="break-all rounded bg-muted/50 px-2 py-1.5 font-mono text-xs text-foreground">
              {data.wallet_address}
            </p>
          </div>
        )}
        {data.message && (
          <p className="text-muted-foreground">{data.message}</p>
        )}
      </div>
    </div>
  );
}
