"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Merchant `price` is USD cents (e.g. 149 → $1.49). */
const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

export type ProductData = {
  id: string;
  title: string;
  /** USD cents */
  price?: number;
  category?: string | null;
  origin_state?: string | null;
  artisan_name?: string | null;
  image_url?: string | null;
  description?: string | null;
};

function formatUsdFromCents(cents: number | undefined): string {
  if (cents == null) {
    return "—";
  }
  return USD.format(cents / 100);
}

type ProductCardProps = {
  data: ProductData;
  /** Compact layout for grid; full for single product detail */
  compact?: boolean;
  className?: string;
};

export function ProductCard({ data, compact = false, className }: ProductCardProps) {
  const description = data.description?.trim();
  const showMeta = data.artisan_name || data.origin_state;

  return (
    <Card
      className={cn(
        "overflow-hidden",
        compact ? "flex flex-col" : "flex flex-col sm:flex-row sm:max-w-2xl",
        className
      )}
    >
      {data.image_url ? (
        <div
          className={cn(
            "shrink-0 bg-muted",
            compact
              ? "aspect-square w-full"
              : "aspect-square w-full sm:w-48 sm:aspect-auto sm:h-auto sm:min-h-[12rem]"
          )}
        >
          <img
            src={data.image_url}
            alt={data.title}
            className="h-full w-full object-cover"
          />
        </div>
      ) : (
        <div
          className={cn(
            "shrink-0 flex items-center justify-center bg-muted text-muted-foreground text-xs",
            compact
              ? "aspect-square w-full"
              : "aspect-square w-full sm:w-48 sm:aspect-auto sm:min-h-[12rem]"
          )}
        >
          No image
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <CardHeader className="space-y-1 p-4 pb-0">
          <h3 className="font-semibold leading-tight text-foreground line-clamp-2">
            {data.title}
          </h3>
          {showMeta && (
            <p className="text-muted-foreground text-xs">
              {[data.artisan_name, data.origin_state].filter(Boolean).join(" · ")}
            </p>
          )}
          {data.category && !compact && (
            <span className="inline-block rounded bg-muted px-1.5 py-0.5 font-medium text-muted-foreground text-xs">
              {data.category}
            </span>
          )}
        </CardHeader>
        <CardContent className="mt-auto space-y-2 p-4 pt-2">
          <p className="font-semibold text-foreground">
            {formatUsdFromCents(data.price)}
          </p>
          {description && (
            <p
              className={cn(
                "text-muted-foreground text-sm",
                compact && "line-clamp-2"
              )}
            >
              {description}
            </p>
          )}
        </CardContent>
      </div>
    </Card>
  );
}
