"use client";

import { cn } from "@/lib/utils";
import type { ProductData } from "./product-card";
import { ProductCard } from "./product-card";

export type ProductGridData = {
  _ui?: { type: string };
  products: ProductData[];
  message?: string;
};

type ProductGridProps = {
  data: ProductGridData;
  className?: string;
};

export function ProductGrid({ data, className }: ProductGridProps) {
  const products = data.products ?? [];
  const count = products.length;

  if (count === 0) {
    return (
      <div
        className={cn(
          "rounded-lg border bg-muted/30 px-4 py-6 text-center text-muted-foreground text-sm",
          className
        )}
      >
        {data.message ?? "No products found."}
      </div>
    );
  }

  return (
    <div className={cn(className)}>
      <p className="mb-3 text-muted-foreground text-sm">
        {count} {count === 1 ? "product" : "products"} found
      </p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {products.map((product) => (
          <ProductCard key={product.id} data={product} compact />
        ))}
      </div>
    </div>
  );
}
