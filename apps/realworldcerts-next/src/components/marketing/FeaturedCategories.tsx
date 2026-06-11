import { categoryOptions } from "@/data/filters";

const categoryDescriptions: Record<string, string> = {
  course: "Guided learning modules with compact explanations and task-ready notes.",
  "practice-test":
    "Timed repetition systems built for confidence, scoring clarity, and correction loops.",
  "study-tool":
    "Reusable boards, planners, and mapping tools for ongoing revision work.",
  "career-track":
    "Structured pathways that connect certification momentum to role progression."
};

export function FeaturedCategories() {
  return (
    <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
      {categoryOptions.map((category) => (
        <article
          key={category.value}
          className="rounded-md border border-[color:var(--border)] bg-white p-5 transition-colors duration-200 hover:border-[color:var(--border-hover)] hover:bg-[color:var(--surface)]"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--text-muted)]">
            {category.label}
          </p>
          <p className="mt-4 text-lg font-semibold tracking-tight text-[color:var(--text-primary)]">
            Modular discovery
          </p>
          <p className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">
            {categoryDescriptions[category.value]}
          </p>
        </article>
      ))}
    </section>
  );
}
