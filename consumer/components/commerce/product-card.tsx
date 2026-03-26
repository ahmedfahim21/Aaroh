"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

export type ProductData = {
  id: string;
  title: string;
  price?: number;
  price_rs?: number;
  category?: string | null;
  origin_state?: string | null;
  artisan_name?: string | null;
  image_url?: string | null;
  description?: string | null;
};

type ProductCardProps = {
  data: ProductData;
  /** Compact layout for grid; full for single product detail */
  compact?: boolean;
  className?: string;
};

export function ProductCard({ data, compact = false, className }: ProductCardProps) {
  const priceRs = data.price_rs ?? (data.price != null ? data.price / 100 : 0);
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
            {INR.format(priceRs)}
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
