"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PlusIcon, MinusIcon, TrashIcon, ShoppingBagIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNearCartSync } from "@/hooks/use-near-cart-sync";

const USDC = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export type CartItemData = {
  product_id: string;
  title: string;
  quantity: number;
  price_cents: number;
  line_total_cents: number;
  image_url?: string;
};

export type CartViewData = {
  _ui?: { type: string };
  items: CartItemData[];
  total_cents: number;
  message?: string;
  can_checkout?: boolean;
};

type CartViewProps = {
  data: CartViewData;
  className?: string;
  onUpdateQuantity?: (productId: string, quantity: number) => void;
  onRemoveItem?: (productId: string) => void;
  onCheckout?: () => void;
};

export function CartView({
  data,
  className,
  onUpdateQuantity,
  onRemoveItem,
  onCheckout,
}: CartViewProps) {
  const items = data.items ?? [];
  const totalPaise = data.total_cents ?? 0;
  const canCheckout = data.can_checkout !== false;

  // Sync cart to NEAR whenever it changes (no-op if not signed in with NEAR)
  useNearCartSync(data);

  if (items.length === 0) {
    return (
      <div
        className={cn(
          "rounded-lg border bg-muted/30 px-6 py-12 text-center",
          className
        )}
      >
        <ShoppingBagIcon className="mx-auto mb-3 h-12 w-12 text-muted-foreground/50" />
        <p className="text-muted-foreground text-sm">
          {data.message ?? "Your cart is empty"}
        </p>
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
      <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-2">
          <ShoppingBagIcon className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm">Shopping Cart</span>
        </div>
        <Badge variant="secondary" className="text-xs">
          {items.length} {items.length === 1 ? "item" : "items"}
        </Badge>
      </div>

      <ul className="divide-y max-h-[400px] overflow-y-auto">
        {items.map((item) => (
          <li
            key={item.product_id}
            className="flex items-start gap-3 px-4 py-4 hover:bg-muted/20 transition-colors"
          >
            {item.image_url ? (
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-muted">
                <img
                  src={item.image_url}
                  alt={item.title}
                  className="h-full w-full object-cover"
                />
              </div>
            ) : (
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground text-xs">
                —
              </div>
            )}

            <div className="min-w-0 flex-1 space-y-2">
              <p className="font-medium text-sm text-foreground line-clamp-2">
                {item.title}
              </p>
              <p className="text-muted-foreground text-xs">
                {USDC.format(item.price_cents / 100)} each
              </p>

              <div className="flex items-center gap-2">
                {onUpdateQuantity ? (
                  <div className="flex items-center gap-1 rounded-md border">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => onUpdateQuantity(item.product_id, item.quantity - 1)}
                      disabled={item.quantity <= 1}
                    >
                      <MinusIcon className="h-3 w-3" />
                    </Button>
                    <span className="min-w-[2ch] text-center text-sm font-medium">
                      {item.quantity}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => onUpdateQuantity(item.product_id, item.quantity + 1)}
                    >
                      <PlusIcon className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <span className="text-muted-foreground text-xs">
                    Qty: {item.quantity}
                  </span>
                )}

                {onRemoveItem && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 text-destructive hover:text-destructive"
                    onClick={() => onRemoveItem(item.product_id)}
                  >
                    <TrashIcon className="h-3 w-3" />
                    Remove
                  </Button>
                )}
              </div>
            </div>

            <div className="shrink-0 text-right">
              <p className="font-semibold text-sm text-foreground">
                {USDC.format(item.line_total_cents / 100)}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <div className="border-t bg-muted/10">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="font-medium text-muted-foreground">Subtotal</span>
          <span className="font-semibold text-lg text-foreground">
            {USDC.format(totalPaise / 100)}
          </span>
        </div>

        {canCheckout && onCheckout && (
          <div className="border-t px-4 py-3">
            <Button
              className="w-full gap-2"
              size="lg"
              onClick={onCheckout}
            >
              Proceed to Checkout
              <span className="font-semibold">
                {USDC.format(totalPaise / 100)}
              </span>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
