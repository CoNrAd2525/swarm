"use client";

import { useMemo, useState } from "react";

import { DirectoryCard } from "@/components/directory/DirectoryCard";
import {
  DirectoryFilters,
  type DirectoryFiltersValue
} from "@/components/directory/DirectoryFilters";
import { DirectoryToolbar } from "@/components/directory/DirectoryToolbar";
import type { DirectoryItem } from "@/data/types";
import {
  defaultDirectoryFilters,
  filterDirectoryItems,
  sortDirectoryItems
} from "@/lib/directory";

function toggleValue<T>(items: T[], value: T) {
  return items.includes(value)
    ? items.filter((item) => item !== value)
    : [...items, value];
}

export function DirectoryDashboard({ items }: { items: DirectoryItem[] }) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState(defaultDirectoryFilters);

  const results = useMemo(() => {
    return sortDirectoryItems(filterDirectoryItems(items, filters), filters.sortBy);
  }, [filters, items]);

  const filterValue: DirectoryFiltersValue = {
    categories: filters.categories,
    difficulties: filters.difficulties,
    tags: filters.tags,
    featuredOnly: filters.featuredOnly
  };

  return (
    <div className="grid gap-6 px-4 py-6 md:px-6 xl:grid-cols-[300px_minmax(0,1fr)]">
      <div className={filtersOpen ? "block" : "hidden xl:block"}>
        <div className="xl:sticky xl:top-6">
          <DirectoryFilters
            value={filterValue}
            onToggleCategory={(category) =>
              setFilters((current) => ({
                ...current,
                categories: toggleValue(current.categories, category)
              }))
            }
            onToggleDifficulty={(difficulty) =>
              setFilters((current) => ({
                ...current,
                difficulties: toggleValue(current.difficulties, difficulty)
              }))
            }
            onToggleTag={(tag) =>
              setFilters((current) => ({
                ...current,
                tags: toggleValue(current.tags, tag)
              }))
            }
            onToggleFeatured={() =>
              setFilters((current) => ({
                ...current,
                featuredOnly: !current.featuredOnly
              }))
            }
            onReset={() => setFilters(defaultDirectoryFilters)}
          />
        </div>
      </div>

      <div className="space-y-4">
        <DirectoryToolbar
          query={filters.query}
          resultCount={results.length}
          sortBy={filters.sortBy}
          onQueryChange={(query) =>
            setFilters((current) => ({
              ...current,
              query
            }))
          }
          onSortChange={(sortBy) =>
            setFilters((current) => ({
              ...current,
              sortBy
            }))
          }
        />

        <div className="xl:hidden">
          <button
            type="button"
            onClick={() => setFiltersOpen((current) => !current)}
            className="rounded-md border border-[color:var(--border)] bg-[color:var(--bg-subtle)] px-4 py-2.5 text-sm font-medium text-[color:var(--text-secondary)] transition-colors hover:border-[color:var(--border-hover)] hover:bg-[color:var(--surface)] hover:text-[color:var(--text-primary)]"
          >
            {filtersOpen ? "Hide filters" : "Show filters"}
          </button>
        </div>

        {results.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {results.map((item) => (
              <DirectoryCard key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-[color:var(--border-hover)] bg-[color:var(--bg-subtle)] px-6 py-12 text-center">
            <p className="text-lg font-semibold text-[color:var(--text-primary)]">
              No results match the current filters
            </p>
            <p className="mt-2 text-sm text-[color:var(--text-secondary)]">
              Reset the active chips or search for a broader certification topic.
            </p>
            <button
              type="button"
              onClick={() => setFilters(defaultDirectoryFilters)}
              className="mt-5 rounded-md border border-[color:var(--border)] bg-white px-4 py-2.5 text-sm font-medium text-[color:var(--text-primary)] transition-colors hover:border-[color:var(--border-hover)] hover:bg-[color:var(--surface)]"
            >
              Reset filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
