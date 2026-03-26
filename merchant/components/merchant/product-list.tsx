"use client";

import { useEffect, useState } from "react";

type Product = {
  id: string;
  title: string;
  price: number;
  image_url?: string | null;
  stock: number;
  category?: string;
  description?: string;
};

export function ProductList({ slug }: { slug: string }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/merchants/${slug}/products`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Failed to load products");
        }
        return res.json();
      })
      .then((data) => setProducts(data.products ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading products...</p>;
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  if (!products.length) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-sm text-muted-foreground">No products found.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="text-left font-medium px-4 py-2.5">Product</th>
            <th className="text-left font-medium px-4 py-2.5">Category</th>
            <th className="text-right font-medium px-4 py-2.5">Price</th>
            <th className="text-right font-medium px-4 py-2.5">Stock</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  {p.image_url ? (
                    <img
                      src={p.image_url}
                      alt={p.title}
                      className="size-9 rounded object-cover bg-muted"
                    />
                  ) : (
                    <div className="size-9 rounded bg-muted" />
                  )}
                  <div className="min-w-0">
                    <p className="font-medium truncate">{p.title}</p>
                    <p className="text-xs text-muted-foreground font-mono truncate">
                      {p.id}
                    </p>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {p.category ?? "-"}
              </td>
              <td className="px-4 py-3 text-right font-mono">
                ${(p.price / 100).toFixed(2)}
              </td>
              <td className="px-4 py-3 text-right">
                <span
                  className={
                    p.stock <= 0
                      ? "text-red-600 dark:text-red-400 font-medium"
                      : p.stock <= 5
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-muted-foreground"
                  }
                >
                  {p.stock}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
