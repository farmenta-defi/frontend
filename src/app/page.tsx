import { ClosingCta } from "@/components/landing/closing-cta";
import { HealthExplainer } from "@/components/landing/health-explainer";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { MarketPreview } from "@/components/landing/market-preview";
import { SiteFooter } from "@/components/site/footer";
import { SiteNav } from "@/components/site/nav";
import { RiskDisclosures } from "@/components/site/risk-disclosures";

export default function Home() {
  return (
    <>
      <SiteNav variant="landing" />
      <main className="flex-1">
        <Hero />
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <div className="rule-fade" />
        </div>
        <HowItWorks />
        <MarketPreview />
        <HealthExplainer />
        <section className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8">
          <RiskDisclosures />
        </section>
        <ClosingCta />
      </main>
      <SiteFooter />
    </>
  );
}
