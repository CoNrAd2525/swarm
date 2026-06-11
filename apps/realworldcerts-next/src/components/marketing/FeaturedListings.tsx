import { DirectoryCard } from "@/components/directory/DirectoryCard";
import type { DirectoryItem } from "@/data/types";

export function FeaturedListings({ items }: { items: DirectoryItem[] }) {
  return (
    <section
      id="featured"
      className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"
    >
      <div className="rounded-md border border-[color:var(--border)] bg-[color:var(--bg-subtle)] p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--text-muted)]">
          Featured directory
        </p>
        <h3 className="mt-4 text-3xl font-semibold tracking-tight text-[color:var(--text-primary)]">
          Browse the same sharp card system used across the dashboard.
        </h3>
        <p className="mt-4 max-w-xl text-sm leading-6 text-[color:var(--text-secondary)]">
          Every listing keeps the same premium bordered treatment: bold title,
          concise description, numerical rating badge, taxonomy pills, and clear
          conversion route.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {items.slice(0, 4).map((item) => (
          <DirectoryCard key={item.id} item={item} compact />
        ))}
      </div>
    </section>
  );
}
