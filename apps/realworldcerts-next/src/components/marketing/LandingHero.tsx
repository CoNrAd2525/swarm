import { ArrowRight, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { SurfacePanel } from "@/components/ui/SurfacePanel";

const stats = [
  { label: "Structured listings", value: "180+" },
  { label: "Premium pathways", value: "24" },
  { label: "Avg learner rating", value: "4.8/5" }
];

export function LandingHero() {
  return (
    <section className="grid gap-px rounded-md border border-[color:var(--border)] bg-[color:var(--border)] xl:grid-cols-[minmax(0,1.3fr)_360px]">
      <div className="bg-white p-6 md:p-8 xl:p-10">
        <div className="max-w-3xl space-y-6">
          <div className="inline-flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
            <Sparkles className="h-3.5 w-3.5" />
            Elevated certification discovery
          </div>
          <div className="space-y-4">
            <h2 className="max-w-3xl text-4xl font-semibold tracking-tight text-[color:var(--text-primary)] md:text-5xl xl:text-6xl">
              Premium learning paths for certifications, labs, and career moves.
            </h2>
            <p className="max-w-2xl text-base leading-7 text-[color:var(--text-secondary)] md:text-lg">
              A cleaner, sharper way to browse exam prep, study tools, and
              structured tracks without clutter or low-trust course pages.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button href="/directory">Enter Directory</Button>
            <Button href="#featured" variant="secondary">
              See featured listings
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-px bg-[color:var(--border)]">
        {stats.map((stat) => (
          <SurfacePanel key={stat.label} subtle className="rounded-none p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--text-muted)]">
              {stat.label}
            </p>
            <div className="mt-6 flex items-end justify-between gap-4">
              <p className="text-3xl font-semibold tracking-tight text-[color:var(--text-primary)]">
                {stat.value}
              </p>
              <ArrowRight className="h-5 w-5 text-[color:var(--text-muted)]" />
            </div>
          </SurfacePanel>
        ))}
      </div>
    </section>
  );
}
