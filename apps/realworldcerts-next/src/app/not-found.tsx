import { AppShell } from "@/components/layout/AppShell";
import { TopHeader } from "@/components/layout/TopHeader";
import { Button } from "@/components/ui/Button";
import { SurfacePanel } from "@/components/ui/SurfacePanel";

export default function NotFound() {
  return (
    <AppShell
      header={
        <TopHeader
          title="Listing not found"
          subtitle="The requested certification path does not exist in the current prototype."
        />
      }
    >
      <div className="px-4 py-6 md:px-6">
        <SurfacePanel className="mx-auto max-w-2xl p-8 text-center" subtle>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--text-muted)]">
            404
          </p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-[color:var(--text-primary)]">
            The route is outside the current directory map
          </h2>
          <p className="mt-3 text-sm leading-6 text-[color:var(--text-secondary)]">
            Return to the main dashboard to continue exploring the premium
            certification interface.
          </p>
          <div className="mt-6 flex justify-center">
            <Button href="/directory">Go to directory</Button>
          </div>
        </SurfacePanel>
      </div>
    </AppShell>
  );
}
