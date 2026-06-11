import { AppShell } from "@/components/layout/AppShell";
import { TopHeader } from "@/components/layout/TopHeader";
import { DirectoryDashboard } from "@/components/directory/DirectoryDashboard";
import { directoryItems } from "@/data/directory-items";

export default function DirectoryPage() {
  return (
    <AppShell
      header={
        <TopHeader
          title="Directory Dashboard"
          subtitle="Structured browsing for courses, mock exams, study tools, and career tracks."
        />
      }
    >
      <DirectoryDashboard items={directoryItems} />
    </AppShell>
  );
}
