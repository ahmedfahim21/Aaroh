import type React from "react";
import Script from "next/script";
import { Suspense } from "react";
import { DataStreamProvider } from "@/components/data-stream-provider";
import { TopNav } from "@/components/top-nav";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Script
        src="https://cdn.jsdelivr.net/pyodide/v0.23.4/full/pyodide.js"
        strategy="beforeInteractive"
      />
      <Suspense fallback={null}>
        <TopNav />
      </Suspense>
      <DataStreamProvider>
        {children}
      </DataStreamProvider>
    </>
  );
}
