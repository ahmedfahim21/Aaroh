"use client";

import { StoreIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type MerchantInfoMerchant = {
  name: string;
  base_url: string;
  payment_handlers?: string[];
  product_categories?: string | null;
};

export type MerchantInfoData = {
  _ui?: { type: string };
  success?: boolean;
  merchant?: MerchantInfoMerchant;
  message?: string;
};

type MerchantInfoProps = {
  data: MerchantInfoData;
  className?: string;
};

export function MerchantInfo({ data, className }: MerchantInfoProps) {
  const m = data.merchant;
  if (!m) {
    return (
      <div
        className={cn(
          "rounded-lg border bg-muted/30 px-4 py-6 text-center text-muted-foreground text-sm",
          className
        )}
      >
        {data.message ?? "No merchant details."}
      </div>
    );
  }

  const categories =
    typeof m.product_categories === "string" && m.product_categories.trim()
      ? m.product_categories.split(",").map((c) => c.trim()).filter(Boolean)
      : [];

  return (
    <div
      className={cn(
        "rounded-lg border bg-card text-card-foreground shadow-sm overflow-hidden",
        className
      )}
    >
      <div className="flex items-start gap-3 border-b bg-muted/30 px-4 py-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <StoreIcon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-foreground leading-tight">{m.name}</p>
          <p className="mt-1 break-all font-mono text-muted-foreground text-xs">
            {m.base_url}
          </p>
        </div>
      </div>
      <div className="space-y-3 p-4 text-sm">
        {Array.isArray(m.payment_handlers) && m.payment_handlers.length > 0 && (
          <div>
            <p className="mb-1 text-muted-foreground text-xs uppercase tracking-wide">
              Payment
            </p>
            <p className="text-foreground">{m.payment_handlers.join(", ")}</p>
          </div>
        )}
        {categories.length > 0 && (
          <div>
            <p className="mb-2 text-muted-foreground text-xs uppercase tracking-wide">
              Categories
            </p>
            <div className="flex flex-wrap gap-1.5">
              {categories.map((c) => (
                <span
                  key={c}
                  className="rounded-md bg-muted px-2 py-0.5 text-muted-foreground text-xs"
                >
                  {c}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
