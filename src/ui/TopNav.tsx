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

      {/* Brand mark → home. The real company logo (temporary raster cut
          from 3d_model/nns-logo.png — swap for the master SVG when the
          company provides it); the link carries the accessible name. */}
      <a className="hud-brand" href={hrefFor("home")} aria-label={locale === "ar" ? "الرئيسية" : "Home"}>
        <span className="hud-logo-plate">
          <img className="hud-logo" src="/brand/nns-logo-cut.png" alt="" />
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
