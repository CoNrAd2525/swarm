"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { SidebarRail } from "@/components/layout/SidebarRail";

export function AppShell({
  header,
  children
}: {
  header: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[color:var(--bg)] text-[color:var(--text-primary)]">
      <div className="mx-auto grid min-h-screen max-w-[1720px] xl:grid-cols-[280px_minmax(0,1fr)] xl:border-x xl:border-[color:var(--border)]">
        <div className="hidden border-r border-[color:var(--border)] xl:block">
          <SidebarRail pathname={pathname} />
        </div>

        <div className="flex min-h-screen flex-col">
          {header}
          <main className="flex-1">{children}</main>
        </div>
      </div>
    </div>
  );
}
