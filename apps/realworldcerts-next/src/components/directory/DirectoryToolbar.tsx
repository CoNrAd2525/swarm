import { Search } from "lucide-react";

import { sortOptions, type SortOption } from "@/data/filters";

export function DirectoryToolbar({
  query,
  resultCount,
  sortBy,
  onQueryChange,
  onSortChange
}: {
  query: string;
  resultCount: number;
  sortBy: SortOption;
  onQueryChange: (value: string) => void;
  onSortChange: (value: SortOption) => void;
}) {
  return (
    <div className="rounded-md border border-[color:var(--border)] bg-white">
      <div className="flex flex-col gap-4 p-4 md:p-5 xl:flex-row xl:items-center xl:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--text-muted)]">
            Directory Dashboard
          </p>
          <p className="text-sm text-[color:var(--text-secondary)]">
            {resultCount} structured results across certification tracks, labs,
            and study tools.
          </p>
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <label className="flex min-w-[240px] items-center gap-2 rounded-md border border-[color:var(--border)] bg-[color:var(--bg-subtle)] px-3 py-2.5 text-sm text-[color:var(--text-secondary)]">
            <Search className="h-4 w-4" />
            <input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search tracks, tools, or providers"
              className="w-full bg-transparent outline-none placeholder:text-[color:var(--text-muted)]"
            />
          </label>

          <label className="flex items-center gap-2 rounded-md border border-[color:var(--border)] px-3 py-2.5 text-sm text-[color:var(--text-secondary)]">
            <span>Sort</span>
            <select
              value={sortBy}
              onChange={(event) => onSortChange(event.target.value as SortOption)}
              className="bg-transparent font-medium text-[color:var(--text-primary)] outline-none"
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </div>
  );
}
