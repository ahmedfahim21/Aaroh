"use client";

import { useEffect, useState } from "react";

type OrderData = {
  id: string;
  line_items?: Array<{
    item?: { title?: string; price?: number };
    quantity?: number | { total?: number; fulfilled?: number };
    status?: string;
  }>;
  totals?: Array<{ type?: string; amount?: number }>;
  fulfillment?: {
    expectations?: Array<{
      description?: string;
      destination?: Record<string, string>;
    }>;
  };
};

function getQuantity(q: number | { total?: number; fulfilled?: number } | undefined): number {
  if (q == null) return 1;
  if (typeof q === "number") return q;
  return q.total ?? 1;
}

function formatPrice(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function deriveStatus(order: OrderData): string {
  const statuses = order.line_items?.map((li) => li.status).filter(Boolean) ?? [];
  if (statuses.every((s) => s === "delivered")) return "delivered";
  if (statuses.every((s) => s === "shipped")) return "shipped";
  // An order in the DB means payment succeeded — "processing" is just the
  // default fulfillment state, so surface it as "completed" to the merchant.
  return "completed";
}

export function OrderList({ slug }: { slug: string }) {
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/merchants/${slug}/orders`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Failed to load orders");
        }
        return res.json();
      })
      .then((data) => setOrders(data.orders ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading orders...</p>;
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  if (!orders.length) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-sm text-muted-foreground">No orders yet.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {orders.map((order) => {
        const total = order.totals?.find((t) => t.type === "total");
        const itemCount =
          order.line_items?.reduce(
            (sum, li) => sum + getQuantity(li.quantity),
            0
          ) ?? 0;
        const status = deriveStatus(order);
        const shippingDesc =
          order.fulfillment?.expectations?.[0]?.description;

        return (
          <div key={order.id} className="rounded-lg border bg-card p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-mono text-sm font-medium truncate">
                    {order.id}
                  </p>
                  <StatusBadge status={status} />
                </div>
                <div className="mt-1.5 text-sm text-muted-foreground">
                  {itemCount} item{itemCount !== 1 ? "s" : ""}
                  {order.line_items?.map((li, i) => {
                    const qty = getQuantity(li.quantity);
                    return (
                      <span key={i}>
                        {i === 0 ? " — " : ", "}
                        {li.item?.title ?? "Item"}
                        {qty > 1 ? ` x${qty}` : ""}
                      </span>
                    );
                  })}
                </div>
                {shippingDesc && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {shippingDesc}
                  </p>
                )}
              </div>
              <div className="text-right shrink-0">
                {total && (
                  <p className="font-mono font-medium">
                    {formatPrice(total.amount ?? 0)}
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  const colors =
    s === "completed" || s === "placed"
      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
      : s === "shipped"
        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
        : s === "processing"
          ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
          : s === "cancelled"
            ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
            : "bg-muted text-muted-foreground";

  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${colors}`}>
      {status}
    </span>
  );
}
