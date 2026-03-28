"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CopyIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

export function CopyAgentAddressButton({
  address,
  className,
  stopPropagation = false,
}: {
  address: string;
  className?: string;
  /** Use on clickable cards so the copy click does not trigger navigation. */
  stopPropagation?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className={cn(
        "h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground",
        className
      )}
      aria-label="Copy wallet address"
      title="Copy address"
      onClick={(e) => {
        if (stopPropagation) e.stopPropagation();
        void navigator.clipboard.writeText(address).then(() => {
          toast.success("Address copied");
        });
      }}
    >
      <CopyIcon size={14} />
    </Button>
  );
}
