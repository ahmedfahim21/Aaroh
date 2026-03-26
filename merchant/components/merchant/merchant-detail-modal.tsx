"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ProductList } from "./product-list";
import { OrderList } from "./order-list";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "products", label: "Products" },
  { id: "orders", label: "Orders" },
] as const;

type Tab = (typeof TABS)[number]["id"];

export function MerchantDetailModal({
  slug,
  name,
  open,
  onOpenChange,
}: {
  slug: string;
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [tab, setTab] = useState<Tab>("products");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{name}</DialogTitle>
          <DialogDescription className="font-mono text-xs">
            {slug}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-1 border-b">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={cn(
                "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                tab === t.id
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {tab === "products" ? (
            <ProductList slug={slug} />
          ) : (
            <OrderList slug={slug} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
