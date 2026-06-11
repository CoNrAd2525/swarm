export function SectionHeading({
  eyebrow,
  title,
  description
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[color:var(--text-muted)]">
        {eyebrow}
      </p>
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight text-[color:var(--text-primary)] md:text-3xl">
          {title}
        </h2>
        <p className="max-w-2xl text-sm leading-6 text-[color:var(--text-secondary)] md:text-base">
          {description}
        </p>
      </div>
    </div>
  );
}
