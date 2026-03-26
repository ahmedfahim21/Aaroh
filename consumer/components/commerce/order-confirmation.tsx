"use client";

import { CheckCircleIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type OrderConfirmationData = {
  _ui?: { type: string };
  success?: boolean;
  order_id?: string;
  message?: string;
};

type OrderConfirmationProps = {
  data: OrderConfirmationData;
  className?: string;
};

export function OrderConfirmation({ data, className }: OrderConfirmationProps) {
  const success = data.success !== false;
  const orderId = data.order_id;
  const message = data.message ?? "Thank you for your payment.";

  return (
    <div
      className={cn(
        "rounded-lg border bg-card text-card-foreground shadow-sm overflow-hidden",
        className
      )}
    >
      <div className="flex flex-col items-center gap-3 p-6 text-center">
        <div
          className={cn(
            "flex size-12 items-center justify-center rounded-full",
            success ? "bg-green-100 text-green-600 dark:bg-green-950/50" : "bg-muted text-muted-foreground"
          )}
        >
          <CheckCircleIcon className="size-7" />
        </div>
        <div className="space-y-1">
          {orderId && (
            <p className="font-medium text-foreground">
              Order <span className="font-mono text-sm">{orderId}</span>
            </p>
          )}
          <p className="text-muted-foreground text-sm">{message}</p>
        </div>
      </div>
    </div>
  );
}
