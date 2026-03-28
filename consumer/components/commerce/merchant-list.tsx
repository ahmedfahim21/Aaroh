"use client";

import { StoreIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type MerchantListEntry = {
  name: string;
  url: string;
  product_categories?: string[];
};

export type MerchantListData = {
  _ui?: { type: string };
  merchants?: MerchantListEntry[];
  matches?: MerchantListEntry[];
  all_merchants?: MerchantListEntry[];
  count?: number;
  error?: string;
  message?: string;
  suggestion?: string;
  filtered_by?: string;
};

type MerchantListProps = {
  data: MerchantListData;
  className?: string;
};

function normalizeEntries(data: MerchantListData): MerchantListEntry[] {
  const raw =
    data.merchants ??
    data.matches ??
    data.all_merchants ??
    [];
  return raw;
}

export function MerchantList({ data, className }: MerchantListProps) {
  const entries = normalizeEntries(data);
  const count = data.count ?? entries.length;

  if (entries.length === 0) {
    return (
      <div
        className={cn(
          "rounded-lg border bg-muted/30 px-4 py-6 text-center text-muted-foreground text-sm",
          className
        )}
      >
        {data.message ??
          (data.error
            ? `${data.error}${data.suggestion ? ` ${data.suggestion}` : ""}`
            : "No merchants found.")}
      </div>
    );
  }

  return (
    <div className={cn(className)}>
      {(data.error || data.filtered_by) && (
        <div className="mb-3 space-y-1 rounded-md border border-amber-200/50 bg-amber-50/50 px-3 py-2 dark:border-amber-900/50 dark:bg-amber-950/20">
          {data.error && (
            <p className="text-amber-900 dark:text-amber-200 text-sm">{data.error}</p>
          )}
          {data.filtered_by && (
            <p className="text-muted-foreground text-xs">
              Filtered by: {data.filtered_by}
            </p>
          )}
          {data.suggestion && (
            <p className="text-muted-foreground text-xs">{data.suggestion}</p>
          )}
        </div>
      )}
      <p className="mb-3 text-muted-foreground text-sm">
        {count} {count === 1 ? "merchant" : "merchants"}
      </p>
      <ul className="flex flex-col gap-2">
        {entries.map((m) => (
          <li
            key={m.url}
            className="flex items-start gap-3 rounded-lg border bg-card px-3 py-3 shadow-sm"
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <StoreIcon className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-foreground text-sm">{m.name}</p>
              <p className="break-all font-mono text-muted-foreground text-xs">
                {m.url}
              </p>
              {m.product_categories && m.product_categories.length > 0 && (
                <p className="mt-1 line-clamp-2 text-muted-foreground text-xs">
                  {m.product_categories.join(" · ")}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
