import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Badge({
  children,
  tone = "slate",
  className
}: {
  children: ReactNode;
  tone?: "blue" | "emerald" | "slate" | "amber";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]",
        tone === "blue" &&
          "border-blue-200 bg-blue-50 text-blue-700",
        tone === "emerald" &&
          "border-emerald-200 bg-emerald-50 text-emerald-700",
        tone === "amber" &&
          "border-amber-200 bg-amber-50 text-amber-700",
        tone === "slate" &&
          "border-slate-200 bg-slate-50 text-slate-600",
        className
      )}
    >
      {children}
    </span>
  );
}
