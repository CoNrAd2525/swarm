import { Bell, Search, SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/Button";

export function TopHeader({
  title,
  subtitle,
  showFiltersButton = false,
  onToggleFilters
}: {
  title: string;
  subtitle: string;
  showFiltersButton?: boolean;
  onToggleFilters?: () => void;
}) {
  return (
    <header className="border-b border-[color:var(--border)] bg-white">
      <div className="flex flex-col gap-4 px-4 py-4 md:px-6 xl:flex-row xl:items-center xl:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[color:var(--text-muted)]">
            RealWorldCerts
          </p>
          <h1 className="text-xl font-semibold tracking-tight text-[color:var(--text-primary)] md:text-2xl">
            {title}
          </h1>
          <p className="text-sm text-[color:var(--text-secondary)]">{subtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-[220px] items-center gap-2 rounded-md border border-[color:var(--border)] bg-[color:var(--bg-subtle)] px-3 py-2.5 text-sm text-[color:var(--text-secondary)]">
            <Search className="h-4 w-4" />
            <span>Search paths, tools, or exams</span>
          </div>
          {showFiltersButton ? (
            <button
              type="button"
              onClick={onToggleFilters}
              className="inline-flex items-center gap-2 rounded-md border border-[color:var(--border)] px-3 py-2.5 text-sm font-medium text-[color:var(--text-secondary)] transition-colors hover:border-[color:var(--border-hover)] hover:bg-[color:var(--bg-subtle)] xl:hidden"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filters
            </button>
          ) : null}
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-[color:var(--border)] text-[color:var(--text-secondary)] transition-colors hover:border-[color:var(--border-hover)] hover:bg-[color:var(--bg-subtle)]"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
          </button>
          <Button href="/directory" variant="primary">
            Browse Directory
          </Button>
        </div>
      </div>
    </header>
  );
}
