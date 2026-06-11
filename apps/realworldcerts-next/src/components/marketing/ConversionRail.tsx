import { Button } from "@/components/ui/Button";

const blocks = [
  {
    title: "Payments and enrollment",
    description:
      "Route learners into clean purchase and checkout flows with more confidence and less friction.",
    href: "#payments",
    cta: "Review payment path"
  },
  {
    title: "Support and onboarding",
    description:
      "Surface clear support entry points for account setup, access, and learning assistance.",
    href: "#support",
    cta: "Open support view"
  },
  {
    title: "Enterprise and teams",
    description:
      "Position certification bundles and progress systems for teams or organization-level buyers.",
    href: "/directory",
    cta: "View team-ready listings"
  }
];

export function ConversionRail() {
  return (
    <section className="grid gap-4 2xl:grid-cols-3">
      {blocks.map((block, index) => (
        <article
          key={block.title}
          id={index === 0 ? "payments" : index === 1 ? "support" : undefined}
          className="rounded-md border border-[color:var(--border)] bg-white p-5"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--text-muted)]">
            Conversion rail
          </p>
          <h3 className="mt-4 text-xl font-semibold tracking-tight text-[color:var(--text-primary)]">
            {block.title}
          </h3>
          <p className="mt-3 text-sm leading-6 text-[color:var(--text-secondary)]">
            {block.description}
          </p>
          <div className="mt-6">
            <Button href={block.href} variant="secondary">
              {block.cta}
            </Button>
          </div>
        </article>
      ))}
    </section>
  );
}
