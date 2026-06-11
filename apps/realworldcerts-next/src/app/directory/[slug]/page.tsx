import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, Clock3, Star } from "lucide-react";

import { DirectoryCard } from "@/components/directory/DirectoryCard";
import { AppShell } from "@/components/layout/AppShell";
import { TopHeader } from "@/components/layout/TopHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SurfacePanel } from "@/components/ui/SurfacePanel";
import { directoryItems, getDirectoryItemBySlug } from "@/data/directory-items";
import { getRelatedItems } from "@/lib/directory";
import { formatRating } from "@/lib/utils";

export function generateStaticParams() {
  return directoryItems.map((item) => ({
    slug: item.slug
  }));
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const item = getDirectoryItemBySlug(slug);

  if (!item) {
    return { title: "Listing not found" };
  }

  return {
    title: `${item.title} | RealWorldCerts`,
    description: item.shortDescription
  };
}

export default async function ListingDetailPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const item = getDirectoryItemBySlug(slug);

  if (!item) {
    notFound();
  }

  const relatedItems = getRelatedItems(item.slug);

  return (
    <AppShell
      header={
        <TopHeader
          title={item.title}
          subtitle="Listing details with structured outcomes, modules, and related inventory."
        />
      }
    >
      <div className="space-y-6 px-4 py-6 md:px-6">
        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_340px]">
          <SurfacePanel className="p-6 md:p-8" subtle>
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="blue">{item.category.replace("-", " ")}</Badge>
                <Badge tone="amber">{item.difficulty}</Badge>
                <Badge tone="emerald">{item.provider}</Badge>
              </div>
              <div className="space-y-4">
                <h2 className="max-w-3xl text-3xl font-semibold tracking-tight text-[color:var(--text-primary)] md:text-5xl">
                  {item.title}
                </h2>
                <p className="max-w-3xl text-base leading-7 text-[color:var(--text-secondary)]">
                  {item.longDescription}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button href={item.ctaHref}>{item.ctaLabel}</Button>
                <Button href="/directory" variant="secondary">
                  Back to directory
                </Button>
              </div>
            </div>
          </SurfacePanel>

          <SurfacePanel className="p-6">
            <div className="space-y-5">
              <div className="flex items-center justify-between rounded-md border border-[color:var(--border)] bg-[color:var(--bg-subtle)] px-4 py-3">
                <span className="text-sm text-[color:var(--text-secondary)]">
                  Rating
                </span>
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[color:var(--text-primary)]">
                  <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                  {formatRating(item.rating)}
                </span>
              </div>
              <div className="grid gap-3">
                <div className="rounded-md border border-[color:var(--border)] px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
                    Duration
                  </p>
                  <p className="mt-2 inline-flex items-center gap-2 text-sm text-[color:var(--text-primary)]">
                    <Clock3 className="h-4 w-4 text-[color:var(--text-muted)]" />
                    {item.durationLabel}
                  </p>
                </div>
                <div className="rounded-md border border-[color:var(--border)] px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
                    Price
                  </p>
                  <p className="mt-2 text-sm text-[color:var(--text-primary)]">
                    {item.priceLabel}
                  </p>
                </div>
                <div className="rounded-md border border-[color:var(--border)] px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
                    Reviews
                  </p>
                  <p className="mt-2 text-sm text-[color:var(--text-primary)]">
                    {item.reviewCount} verified learner ratings
                  </p>
                </div>
              </div>

              <Link
                href={item.ctaHref}
                className="inline-flex items-center gap-2 text-sm font-semibold text-[color:var(--accent-blue)]"
              >
                Open listing path
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
          </SurfacePanel>
        </section>

        <section className="grid gap-6 xl:grid-cols-3">
          <SurfacePanel className="p-6 xl:col-span-1">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--text-muted)]">
              Outcomes
            </p>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-[color:var(--text-secondary)]">
              {item.outcomes.map((outcome) => (
                <li key={outcome}>{outcome}</li>
              ))}
            </ul>
          </SurfacePanel>

          <SurfacePanel className="p-6 xl:col-span-1">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--text-muted)]">
              Modules
            </p>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-[color:var(--text-secondary)]">
              {item.modules.map((module) => (
                <li key={module}>{module}</li>
              ))}
            </ul>
          </SurfacePanel>

          <SurfacePanel className="p-6 xl:col-span-1">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--text-muted)]">
              Audience
            </p>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-[color:var(--text-secondary)]">
              {item.audience.map((segment) => (
                <li key={segment}>{segment}</li>
              ))}
            </ul>
          </SurfacePanel>
        </section>

        <section className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--text-muted)]">
              Related listings
            </p>
            <h3 className="text-2xl font-semibold tracking-tight text-[color:var(--text-primary)]">
              Continue through the directory
            </h3>
          </div>

          <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {relatedItems.map((relatedItem) => (
              <DirectoryCard key={relatedItem.id} item={relatedItem} compact />
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
