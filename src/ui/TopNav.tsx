import type { JSX } from "react";

import { BRAND, NAV } from "../content";
import { useLocale } from "../locale";
import { hrefFor, useRoute } from "../router";

/**
 * Command-center chrome, multi-page edition: the corner frame, the brand
 * lockup, and the primary navigation. One markup tree serves both tiers —
 * desktop renders the nav as a glass pill rail top-center; phones re-dock
 * the same list as a bottom tab bar (thumb reach), all in CSS.
 *
 * Links are real <a href="#/…"> elements: middle-click, copy-link and
 * back/forward all behave; the hash router picks up the change.
 */
export function TopNav(): JSX.Element {
  const locale = useLocale();
  const route = useRoute();

  return (
    <>
      {/* Corner frame (decorative) */}
      <div className="hud" aria-hidden="true">
        <span className="frame-corner tl" />
        <span className="frame-corner tr" />
        <span className="frame-corner bl" />
        <span className="frame-corner br" />
      </div>

      {/* Brand mark → home */}
      <a className="hud-brand" href={hrefFor("home")} aria-label={locale === "ar" ? "الرئيسية" : "Home"}>
        <span className="hud-shield">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3l8 3v6c0 4.6-3.2 7.9-8 9-4.8-1.1-8-4.4-8-9V6z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
        </span>
        <span className="hud-brand-name">{BRAND.nameAr}</span>
        <span className="hud-brand-en mono">{BRAND.nameEn}</span>
      </a>

      {/* Primary navigation */}
      <nav className="site-nav" aria-label={locale === "ar" ? "التنقل الرئيسي" : "Primary navigation"}>
        {NAV.map((item) => (
          <a
            key={item.route}
            href={hrefFor(item.route)}
            className={`nav-link${route === item.route ? " active" : ""}`}
            aria-current={route === item.route ? "page" : undefined}
          >
            <span className="mono nav-tag">{item.tag}</span>
            <span className="nav-label">{item.label[locale]}</span>
          </a>
        ))}
      </nav>
    </>
  );
}
