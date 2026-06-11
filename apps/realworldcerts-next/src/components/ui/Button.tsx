import type { ReactNode } from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";

const buttonStyles =
  "inline-flex items-center justify-center rounded-md border px-4 py-2.5 text-sm font-semibold tracking-tight transition-colors duration-200";

export function Button({
  href,
  children,
  variant = "primary",
  className
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        buttonStyles,
        variant === "primary" &&
          "border-[color:var(--accent-blue)] bg-[color:var(--accent-blue)] text-white hover:border-[color:var(--accent-blue-strong)] hover:bg-[color:var(--accent-blue-strong)]",
        variant === "secondary" &&
          "border-[color:var(--border)] bg-white text-[color:var(--text-primary)] hover:border-[color:var(--border-hover)] hover:bg-[color:var(--bg-subtle)]",
        variant === "ghost" &&
          "border-transparent bg-transparent text-[color:var(--text-secondary)] hover:border-[color:var(--border)] hover:bg-[color:var(--bg-subtle)] hover:text-[color:var(--text-primary)]",
        className
      )}
    >
      {children}
    </Link>
  );
}
