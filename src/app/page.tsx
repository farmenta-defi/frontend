import { Hero } from "@/components/landing/hero";
import { SiteNav } from "@/components/site/nav";

export default function Home() {
  return (
    // RainbowKit wraps the page in its own div, so the body's flex column
    // never reaches <main>. This one does, and lets the hero fill the screen.
    <div className="flex min-h-dvh flex-col">
      <SiteNav variant="landing" />
      <main className="flex flex-1 flex-col">
        <Hero />
      </main>
    </div>
  );
}
