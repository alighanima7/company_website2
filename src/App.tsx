import { useEffect, useRef } from "react";
import type { JSX } from "react";

import { PAGE_TITLES } from "./content";
import { useLocale } from "./locale";
import { FLAGS } from "./perf/probe";
import { HomePage } from "./pages/HomePage";
import { ProductsPage } from "./pages/ProductsPage";
import { RequestsPage } from "./pages/RequestsPage";
import { SupportPage } from "./pages/SupportPage";
import { useRoute } from "./router";
import { SceneBoundary } from "./three/SceneBoundary";
import { Stage } from "./three/Stage";
import { LangToggle } from "./ui/LangToggle";
import { PageFooter } from "./ui/PageFooter";
import { ThemeToggle } from "./ui/ThemeToggle";
import { TopNav } from "./ui/TopNav";

/**
 * App shell: the persistent 3D stage behind everything (fail-soft via
 * SceneBoundary — without WebGL the pages still render completely on the
 * themed body), the fixed chrome (nav + toggles), and the routed page.
 * Theme, locale and route are three independent singleton stores; a
 * navigation never touches the other two, so they stay in sync by
 * construction — no reload, no re-mount of the canvas.
 */
export function App(): JSX.Element {
  const route = useRoute();
  const locale = useLocale();
  const firstRoute = useRef(true);

  useEffect(() => {
    document.title = PAGE_TITLES[route][locale];
  }, [route, locale]);

  // Route change = new document: scroll to top and hand focus to the main
  // landmark so keyboard/screen-reader users land on the new page's start.
  // (Skipped on first paint — stealing initial focus is hostile.)
  useEffect(() => {
    if (firstRoute.current) {
      firstRoute.current = false;
      return;
    }
    window.scrollTo(0, 0);
    document.getElementById("main")?.focus({ preventScroll: true });
  }, [route]);

  return (
    <>
      {/* ?nocanvas=1 drops the whole 3D layer - the harness baseline. */}
      {!FLAGS.nocanvas && (
        <SceneBoundary>
          <Stage />
        </SceneBoundary>
      )}
      <TopNav />
      <main id="main" tabIndex={-1}>
        {route === "home" && <HomePage />}
        {route === "products" && <ProductsPage />}
        {route === "support" && <SupportPage />}
        {route === "requests" && <RequestsPage />}
        <PageFooter />
      </main>
      <ThemeToggle />
      <LangToggle />
    </>
  );
}
