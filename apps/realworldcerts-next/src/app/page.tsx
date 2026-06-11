import { FeaturedListings } from "@/components/marketing/FeaturedListings";
import { AppShell } from "@/components/layout/AppShell";
import { TopHeader } from "@/components/layout/TopHeader";
import { ConversionRail } from "@/components/marketing/ConversionRail";
import { FeaturedCategories } from "@/components/marketing/FeaturedCategories";
import { LandingHero } from "@/components/marketing/LandingHero";
import { TrustStrip } from "@/components/marketing/TrustStrip";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { getFeaturedDirectoryItems } from "@/data/directory-items";

export default function HomePage() {
  const featuredItems = getFeaturedDirectoryItems();

  return (
    <AppShell
      header={
        <TopHeader
          title="Premium Certification Directory"
          subtitle="A high-clarity landing surface for courses, mocks, tools, and support."
        />
      }
    >
      <div className="space-y-6 px-4 py-6 md:px-6">
        <LandingHero />
        <TrustStrip />

        <section className="space-y-4">
          <SectionHeading
            eyebrow="Category architecture"
            title="Cleanly segmented learning inventory"
            description="The homepage mirrors the dashboard logic with modular compartments so visitors understand the directory shape before they click deeper."
          />
          <FeaturedCategories />
        </section>

        <section className="space-y-4">
          <SectionHeading
            eyebrow="Featured listings"
            title="High-trust content cards with sharper signal"
            description="Each card maintains the arcX-inspired bordered structure while the content treatment stays light, readable, and conversion-ready."
          />
          <FeaturedListings items={featuredItems} />
        </section>

        <section className="space-y-4">
          <SectionHeading
            eyebrow="Conversion surfaces"
            title="Structured pathways for payment, support, and team rollout"
            description="The grid keeps commercial actions visible without turning the interface into a cluttered sales page."
          />
          <ConversionRail />
        </section>
      </div>
    </AppShell>
  );
}
