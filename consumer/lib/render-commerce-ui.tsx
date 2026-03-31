"use client";

import type { ReactNode } from "react";
import { CartView } from "@/components/commerce/cart-view";
import { CategoryList } from "@/components/commerce/category-list";
import { CheckoutView } from "@/components/commerce/checkout-view";
import { MerchantInfo } from "@/components/commerce/merchant-info";
import { MerchantList } from "@/components/commerce/merchant-list";
import { OrderConfirmation } from "@/components/commerce/order-confirmation";
import { ProductCard } from "@/components/commerce/product-card";
import { ProductGrid } from "@/components/commerce/product-grid";
import { X402PaymentRequired } from "@/components/commerce/x402-payment-required";

export function renderCommerceUi(
  uiType: string | undefined,
  data: Record<string, unknown> | null,
  reactKey: string
): ReactNode {
  if (!data) return null;
  switch (uiType) {
    case "product-grid":
      return (
        <div className="w-full" key={reactKey}>
          <ProductGrid data={data as Parameters<typeof ProductGrid>[0]["data"]} />
        </div>
      );
    case "product-detail":
      return (
        <div className="w-full" key={reactKey}>
          <ProductCard
            data={(data as { product: Parameters<typeof ProductCard>[0]["data"] }).product}
          />
        </div>
      );
    case "cart":
      return (
        <div className="w-full" key={reactKey}>
          <CartView data={data as Parameters<typeof CartView>[0]["data"]} />
        </div>
      );
    case "checkout":
      return (
        <div className="w-full" key={reactKey}>
          <CheckoutView data={data as Parameters<typeof CheckoutView>[0]["data"]} />
        </div>
      );
    case "order-confirmation":
      return (
        <div className="w-full" key={reactKey}>
          <OrderConfirmation data={data as Parameters<typeof OrderConfirmation>[0]["data"]} />
        </div>
      );
    case "merchant-info":
      return (
        <div className="w-full" key={reactKey}>
          <MerchantInfo data={data as Parameters<typeof MerchantInfo>[0]["data"]} />
        </div>
      );
    case "merchant-list":
      return (
        <div className="w-full" key={reactKey}>
          <MerchantList data={data as Parameters<typeof MerchantList>[0]["data"]} />
        </div>
      );
    case "category-list":
      return (
        <div className="w-full" key={reactKey}>
          <CategoryList data={data as Parameters<typeof CategoryList>[0]["data"]} />
        </div>
      );
    case "x402-payment-required":
      return (
        <div className="w-full" key={reactKey}>
          <X402PaymentRequired
            data={data as Parameters<typeof X402PaymentRequired>[0]["data"]}
          />
        </div>
      );
    default:
      return null;
  }
}
