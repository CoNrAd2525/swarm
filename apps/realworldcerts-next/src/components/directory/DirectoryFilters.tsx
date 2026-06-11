import type { ReactNode } from "react";
import { categoryOptions, difficultyOptions, tagOptions } from "@/data/filters";
import type {
  DirectoryCategory,
  DirectoryDifficulty,
  DirectoryTag
} from "@/data/types";
import { cn } from "@/lib/utils";

function FilterGroup({
  title,
  children
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3 border-b border-[color:var(--border)] pb-5 last:border-b-0 last:pb-0">
      <h3 className="text-sm font-semibold text-[color:var(--text-primary)]">
        {title}
      </h3>
      {children}
    </div>
  );
}

function ToggleChip({
  label,
  active,
  onClick
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md border px-3 py-2 text-left text-sm transition-colors duration-200",
        active
          ? "border-blue-200 bg-blue-50 text-blue-700"
          : "border-[color:var(--border)] bg-white text-[color:var(--text-secondary)] hover:border-[color:var(--border-hover)] hover:bg-[color:var(--surface)] hover:text-[color:var(--text-primary)]"
      )}
    >
      {label}
    </button>
  );
}

export interface DirectoryFiltersValue {
  categories: DirectoryCategory[];
  difficulties: DirectoryDifficulty[];
  tags: DirectoryTag[];
  featuredOnly: boolean;
}

export function DirectoryFilters({
  value,
  onToggleCategory,
  onToggleDifficulty,
  onToggleTag,
  onToggleFeatured,
  onReset
}: {
  value: DirectoryFiltersValue;
  onToggleCategory: (category: DirectoryCategory) => void;
  onToggleDifficulty: (difficulty: DirectoryDifficulty) => void;
  onToggleTag: (tag: DirectoryTag) => void;
  onToggleFeatured: () => void;
  onReset: () => void;
}) {
  return (
    <div className="space-y-5 rounded-md border border-[color:var(--border)] bg-[color:var(--bg-subtle)] p-4 md:p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--text-muted)]">
            Filters
          </p>
          <p className="mt-1 text-sm text-[color:var(--text-secondary)]">
            Narrow the directory by type, level, and themes.
          </p>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="text-sm font-medium text-[color:var(--accent-blue)]"
        >
          Reset
        </button>
      </div>

      <FilterGroup title="Featured">
        <ToggleChip
          label="Show featured only"
          active={value.featuredOnly}
          onClick={onToggleFeatured}
        />
      </FilterGroup>

      <FilterGroup title="Category">
        <div className="grid gap-2">
          {categoryOptions.map((option) => (
            <ToggleChip
              key={option.value}
              label={option.label}
              active={value.categories.includes(option.value)}
              onClick={() => onToggleCategory(option.value)}
            />
          ))}
        </div>
      </FilterGroup>

      <FilterGroup title="Difficulty">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 xl:grid-cols-1">
          {difficultyOptions.map((option) => (
            <ToggleChip
              key={option.value}
              label={option.label}
              active={value.difficulties.includes(option.value)}
              onClick={() => onToggleDifficulty(option.value)}
            />
          ))}
        </div>
      </FilterGroup>

      <FilterGroup title="Themes">
        <div className="flex flex-wrap gap-2">
          {tagOptions.map((option) => (
            <ToggleChip
              key={option.value}
              label={option.label}
              active={value.tags.includes(option.value)}
              onClick={() => onToggleTag(option.value)}
            />
          ))}
        </div>
      </FilterGroup>
    </div>
  );
}
