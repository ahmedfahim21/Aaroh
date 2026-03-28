"use client";

import { TagsIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type CategoryEntry = {
  name: string;
  count: number;
};

export type CategoryListData = {
  _ui?: { type: string };
  categories?: CategoryEntry[];
  message?: string;
};

type CategoryListProps = {
  data: CategoryListData;
  className?: string;
};

export function CategoryList({ data, className }: CategoryListProps) {
  const categories = data.categories ?? [];

  if (categories.length === 0) {
    return (
      <div
        className={cn(
          "rounded-lg border bg-muted/30 px-4 py-6 text-center text-muted-foreground text-sm",
          className
        )}
      >
        {data.message ?? "No categories found."}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg border bg-card text-card-foreground shadow-sm overflow-hidden",
        className
      )}
    >
      <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-2">
        <TagsIcon className="size-4 text-muted-foreground" />
        <span className="font-medium text-sm">Categories</span>
      </div>
      <div className="flex flex-wrap gap-2 p-4">
        {categories.map((c) => (
          <span
            key={c.name}
            className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-3 py-1.5 text-sm"
          >
            <span className="font-medium text-foreground">{c.name}</span>
            <span className="rounded-md bg-background px-1.5 py-0.5 text-muted-foreground text-xs tabular-nums">
              {c.count}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
