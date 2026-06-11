import Link from "next/link";
import { ArrowUpRight, Clock3, Star } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import type { DirectoryItem } from "@/data/types";
import { formatRating } from "@/lib/utils";

const tagToneMap = {
  security: "blue",
  cloud: "blue",
  compliance: "emerald",
  career: "amber",
  "exam-prep": "blue",
  automation: "emerald",
  analytics: "amber",
  beginner: "slate",
  intermediate: "slate",
  advanced: "slate"
} as const;

export function DirectoryCard({
  item,
  compact = false
}: {
  item: DirectoryItem;
  compact?: boolean;
}) {
  return (
    <article className="group rounded-md border border-[color:var(--border)] bg-white transition-colors duration-200 hover:border-[color:var(--border-hover)] hover:bg-[color:var(--surface)]">
      <div className={compact ? "space-y-4 p-4" : "space-y-5 p-5"}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Badge tone={item.featured ? "blue" : "slate"}>
            {item.featured ? "Featured" : item.category.replace("-", " ")}
          </Badge>
          <div className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
            <Star className="h-3.5 w-3.5 fill-current" />
            {formatRating(item.rating)}
          </div>
        </div>

        <div className="space-y-2">
          <Link href={`/directory/${item.slug}`} className="block">
            <h3 className="text-lg font-semibold tracking-tight text-[color:var(--text-primary)] transition-colors group-hover:text-slate-950">
              {item.title}
            </h3>
          </Link>
          <p className="text-sm leading-6 text-[color:var(--text-secondary)]">
            {item.shortDescription}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {item.tags.map((tag) => (
            <Badge
              key={tag}
              tone={tagToneMap[tag]}
              className="normal-case tracking-normal"
            >
              {tag.replace("-", " ")}
            </Badge>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-[color:var(--border)] pt-4 text-sm text-[color:var(--text-secondary)]">
          <span>{item.provider}</span>
          <span className="text-[color:var(--border)]">/</span>
          <span>{item.priceLabel}</span>
          <span className="text-[color:var(--border)]">/</span>
          <span className="inline-flex items-center gap-1.5">
            <Clock3 className="h-4 w-4" />
            {item.durationLabel}
          </span>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-[color:var(--text-muted)]">
            {item.reviewCount} reviews
          </span>
          <Link
            href={`/directory/${item.slug}`}
            className="inline-flex items-center gap-1.5 font-semibold text-[color:var(--accent-blue)] transition-colors hover:text-[color:var(--accent-blue-strong)]"
          >
            {item.ctaLabel}
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </article>
  );
}
