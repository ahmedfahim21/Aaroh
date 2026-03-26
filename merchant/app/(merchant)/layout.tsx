import type React from "react";
import { Suspense } from "react";
import { TopNav } from "@/components/top-nav";

export default function MerchantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Suspense fallback={null}>
        <TopNav />
      </Suspense>
      <main className="min-h-[calc(100dvh-48px)]">{children}</main>
    </>
  );
}
