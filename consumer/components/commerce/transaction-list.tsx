"use client";

import { useEffect, useState } from "react";

type ConsumerOrder = {
  id: string;
  orderId: string;
  merchantUrl: string;
  merchantName?: string | null;
  totalCents?: number | null;
  lineItems?: Array<{
    title: string;
    quantity: number;
    price: number;
  }> | null;
  status: string;
  paymentType?: string | null;
  createdAt: string;
};

function formatPrice(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export function TransactionList() {
  const [orders, setOrders] = useState<ConsumerOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/orders")
      .then((res) => res.json())
      .then((data) => setOrders(data.orders ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading transactions...</p>;
  }

  if (!orders.length) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No transactions yet. Complete a purchase to see it here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {orders.map((order) => {
        const itemCount =
          order.lineItems?.reduce((sum, li) => sum + li.quantity, 0) ?? 0;

        return (
          <div key={order.id} className="rounded-lg border bg-card p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-mono text-sm font-medium truncate">
                    {order.orderId}
                  </p>
                  <StatusBadge status={order.status} />
                </div>
                {order.lineItems && order.lineItems.length > 0 && (
                  <div className="mt-1.5 text-sm text-muted-foreground">
                    {itemCount} item{itemCount !== 1 ? "s" : ""}
                    {order.lineItems.map((li, i) => (
                      <span key={i}>
                        {i === 0 ? " — " : ", "}
                        {li.title}
                        {li.quantity > 1 ? ` x${li.quantity}` : ""}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                  {order.merchantName ? (
                    <span>{order.merchantName}</span>
                  ) : (
                    <span className="font-mono">{order.merchantUrl}</span>
                  )}
                  {order.paymentType && (
                    <span>Payment: {order.paymentType}</span>
                  )}
                  <span>
                    {new Date(order.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
              <div className="text-right shrink-0">
                {order.totalCents != null && (
                  <p className="font-mono font-medium">
                    {formatPrice(order.totalCents)}
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
        : s === "cancelled"
          ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
          : "bg-muted text-muted-foreground";

  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${colors}`}>
      {status}
    </span>
  );
}
