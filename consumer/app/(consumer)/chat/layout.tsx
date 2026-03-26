import type React from "react";
import { cookies } from "next/headers";
import { Suspense } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { auth } from "../../(auth)/auth";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="flex h-[calc(100dvh-48px)]" />}>
      <SidebarWrapper>{children}</SidebarWrapper>
    </Suspense>
  );
}

async function SidebarWrapper({ children }: { children: React.ReactNode }) {
  const [session, cookieStore] = await Promise.all([auth(), cookies()]);
  const isCollapsed = cookieStore.get("sidebar_state")?.value !== "true";

  return (
    <SidebarProvider
      defaultOpen={!isCollapsed}
      style={{ "--sidebar-min-h": "calc(100dvh - 48px)" } as React.CSSProperties}
      className="min-h-[calc(100dvh-48px)] max-h-[calc(100dvh-48px)] overflow-hidden"
    >
      <AppSidebar user={session?.user} />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  );
}
