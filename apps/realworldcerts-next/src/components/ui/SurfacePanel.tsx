import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SurfacePanel({
  children,
  className,
  subtle = false
}: {
  children: ReactNode;
  className?: string;
  subtle?: boolean;
}) {
  return (
    <section
      className={cn(
        "rounded-md border border-[color:var(--border)]",
        subtle ? "bg-[color:var(--bg-subtle)]" : "bg-white",
        className
      )}
    >
      {children}
    </section>
  );
}
