"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShoppingCartIcon, PlusIcon, MinusIcon, CheckIcon } from "lucide-react";
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
  /** Show add to cart button */
  showAddToCart?: boolean;
  /** Callback when add to cart is clicked */
  onAddToCart?: (productId: string, quantity: number) => void;
  className?: string;
};

export function ProductCard({
  data,
  compact = false,
  showAddToCart = false,
  onAddToCart,
  className
}: ProductCardProps) {
  const [quantity, setQuantity] = useState(1);
  const [isAdding, setIsAdding] = useState(false);
  const [justAdded, setJustAdded] = useState(false);

  const priceRs = data.price_rs ?? (data.price != null ? data.price / 100 : 0);
  const description = data.description?.trim();
  const showMeta = data.artisan_name || data.origin_state;

  const handleAddToCart = async () => {
    if (!onAddToCart) return;

    setIsAdding(true);
    try {
      await onAddToCart(data.id, quantity);
      setJustAdded(true);
      setTimeout(() => setJustAdded(false), 2000);
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <Card
      className={cn(
        "group overflow-hidden transition-shadow hover:shadow-md",
        compact ? "flex flex-col" : "flex flex-col sm:flex-row sm:max-w-2xl",
        className
      )}
    >
      {data.image_url ? (
        <div
          className={cn(
            "relative shrink-0 bg-muted overflow-hidden",
            compact
              ? "aspect-square w-full"
              : "aspect-square w-full sm:w-48 sm:aspect-auto sm:h-auto sm:min-h-[12rem]"
          )}
        >
          <img
            src={data.image_url}
            alt={data.title}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
          {data.category && compact && (
            <Badge
              className="absolute top-2 right-2 text-xs"
              variant="secondary"
            >
              {data.category}
            </Badge>
          )}
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
            <Badge variant="secondary" className="w-fit text-xs">
              {data.category}
            </Badge>
          )}
        </CardHeader>
        <CardContent className="mt-auto space-y-3 p-4 pt-2">
          <p className="font-semibold text-lg text-foreground">
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

          {showAddToCart && onAddToCart && (
            <div className="flex items-center gap-2 pt-2">
              <div className="flex items-center gap-1 rounded-md border">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  disabled={quantity <= 1}
                >
                  <MinusIcon className="h-3 w-3" />
                </Button>
                <span className="min-w-[2ch] text-center text-sm font-medium">
                  {quantity}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setQuantity(quantity + 1)}
                >
                  <PlusIcon className="h-3 w-3" />
                </Button>
              </div>

              <Button
                className="flex-1 gap-2"
                onClick={handleAddToCart}
                disabled={isAdding || justAdded}
                size="sm"
              >
                {justAdded ? (
                  <>
                    <CheckIcon className="h-4 w-4" />
                    Added
                  </>
                ) : (
                  <>
                    <ShoppingCartIcon className="h-4 w-4" />
                    Add to Cart
                  </>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </div>
    </Card>
  );
}
