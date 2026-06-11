const proofPoints = [
  "Role-aligned certification paths",
  "Dense mock exams with clear analytics",
  "Support flows for payments and onboarding",
  "Sharper trust presentation for enterprise learners"
];

export function TrustStrip() {
  return (
    <section className="rounded-md border border-[color:var(--border)] bg-[color:var(--bg-subtle)] p-5 md:p-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {proofPoints.map((point) => (
          <div
            key={point}
            className="rounded-md border border-[color:var(--border)] bg-white px-4 py-4 text-sm text-[color:var(--text-secondary)]"
          >
            {point}
          </div>
        ))}
      </div>
    </section>
  );
}
