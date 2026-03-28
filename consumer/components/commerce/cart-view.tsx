"use client";

import { cn } from "@/lib/utils";

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

export type CartItemData = {
  product_id: string;
  title: string;
  quantity: number;
  /** USD cents (alias keys match backend JSON). */
  price_cents?: number;
  price_paise?: number;
  line_total_cents?: number;
  line_total_paise?: number;
};

export type CartViewData = {
  _ui?: { type: string };
  items: CartItemData[];
  /** USD cents (alias keys match backend JSON). */
  total_cents?: number;
  total_paise?: number;
  message?: string;
};

type CartViewProps = {
  data: CartViewData;
  className?: string;
};

function itemUnitCents(item: CartItemData): number {
  return item.price_cents ?? item.price_paise ?? 0;
}

function itemLineCents(item: CartItemData): number {
  return (
    item.line_total_cents ??
    item.line_total_paise ??
    itemUnitCents(item) * item.quantity
  );
}

function formatUsdCents(cents: number): string {
  return USD.format(cents / 100);
}

export function CartView({ data, className }: CartViewProps) {
  const items = data.items ?? [];
  const totalCents = data.total_cents ?? data.total_paise ?? 0;

  if (items.length === 0) {
    return (
      <div
        className={cn(
          "rounded-lg border bg-muted/30 px-4 py-6 text-center text-muted-foreground text-sm",
          className
        )}
      >
        {data.message ?? "Your cart is empty."}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg border bg-card text-card-foreground shadow-sm overflow-hidden",
        className
      )}
    >
      <div className="border-b bg-muted/30 px-4 py-2 font-medium text-sm">
        Cart
      </div>
      <ul className="divide-y">
        {items.map((item) => (
          <li
            key={item.product_id}
            className="flex items-center gap-3 px-4 py-3"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground text-xs">
              —
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-sm text-foreground">
                {item.title}
              </p>
              <p className="text-muted-foreground text-xs">
                {formatUsdCents(itemUnitCents(item))} × {item.quantity}
              </p>
            </div>
            <div className="shrink-0 font-medium text-sm text-foreground">
              {formatUsdCents(itemLineCents(item))}
            </div>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between border-t bg-muted/20 px-4 py-3 font-semibold text-foreground">
        <span>Total</span>
        <span>{formatUsdCents(totalCents)}</span>
      </div>
    </div>
  );
}
