import Link from "next/link";

import { navigationItems, supportLinks } from "@/data/navigation";
import { cn } from "@/lib/utils";

export function SidebarRail({ pathname }: { pathname: string }) {
  return (
    <aside className="flex h-full flex-col bg-[color:var(--bg-subtle)]">
      <div className="border-b border-[color:var(--border)] px-5 py-5">
        <Link href="/" className="block space-y-2">
          <span className="inline-flex rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-700">
            RealWorldCerts
          </span>
          <div>
            <p className="text-sm font-semibold text-[color:var(--text-primary)]">
              Premium certification interface
            </p>
            <p className="text-sm text-[color:var(--text-secondary)]">
              Structured discovery for serious learners.
            </p>
          </div>
        </Link>
      </div>

      <div className="space-y-8 px-4 py-5">
        <div className="space-y-2">
          <p className="px-2 text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
            Navigation
          </p>
          <nav className="space-y-1">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const active =
                item.href === "/"
                  ? pathname === item.href
                  : pathname.startsWith(item.href.split("?")[0]);

              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-md border px-3 py-2.5 text-sm transition-colors duration-200",
                    active
                      ? "border-blue-200 bg-white text-blue-700"
                      : "border-transparent text-[color:var(--text-secondary)] hover:border-[color:var(--border)] hover:bg-white hover:text-[color:var(--text-primary)]"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="space-y-2">
          <p className="px-2 text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
            Support
          </p>
          <div className="space-y-1">
            {supportLinks.map((item) => {
              const Icon = item.icon;

              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className="flex items-center gap-3 rounded-md border border-transparent px-3 py-2.5 text-sm text-[color:var(--text-secondary)] transition-colors duration-200 hover:border-[color:var(--border)] hover:bg-white hover:text-[color:var(--text-primary)]"
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-auto border-t border-[color:var(--border)] px-5 py-5">
        <div className="rounded-md border border-[color:var(--border)] bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
            Mission
          </p>
          <p className="mt-3 text-sm leading-6 text-[color:var(--text-secondary)]">
            Surface clearer certification paths, mock tests, and support flows
            with premium structure instead of clutter.
          </p>
        </div>
      </div>
    </aside>
  );
}
