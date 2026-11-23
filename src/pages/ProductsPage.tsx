import { useEffect, useRef } from "react";
import type { JSX } from "react";

import { PRODUCTS, PRODUCTS_PAGE } from "../content";
import { useLocale } from "../locale";
import { motionState } from "../motion";
import { attachProductScroll, RUNWAY_SVH } from "../productScroll";
import { setProduct, useProduct } from "../productState";
import { hrefFor } from "../router";
import { preloadFmcModels } from "../three/FmcDevice";
import { useSceneFailed } from "../three/SceneBoundary";
import { initReveals } from "../ui/reveal";

/** Static product shots (baked from the real models) that stand in for
 *  the FMC viewers when the WebGL layer has crashed. */
const STATIC_SHOTS: Partial<Record<string, string>> = {
  fmc130: "/images/fmc130-static.webp",
  fmc920: "/images/fmc920-static.webp",
};

/**
 * Products — the hardware lineup in 3D. The glass panel on the copy side
 * carries the switcher and the active product's bilingual specs; the
 * canvas behind mounts exactly ONE showcase at a time (Stage.tsx), so
 * switching products tears the previous model's GPU resources down
 * completely before the next one enters.
 *
 * The FMC devices add a scroll-driven teardown: their GLBs ship real part
 * nodes, so while one is active the page grows a runway section, the
 * stage section pins (position: sticky) and native scroll across the
 * runway maps to the explode progress (productScroll → FmcDevice).
 * Scrolling back reassembles; reduced motion renders no runway at all —
 * the page stays a plain viewport-tall document with the device at rest.
 */
export function ProductsPage(): JSX.Element {
  const l = useLocale();
  const active = useProduct();
  const root = useRef<HTMLDivElement | null>(null);
  const cue = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = root.current;
    return el === null ? undefined : initReveals(el);
  }, []);

  // Warm the FMC models once the lineup is on screen — switching to them
  // then decodes from cache instead of fetching megabytes mid-interaction.
  useEffect(() => {
    preloadFmcModels();
  }, []);

  const glFailed = useSceneFailed();
  const product = PRODUCTS.find((p) => p.id === active) ?? PRODUCTS[0];
  const isFmc = product !== undefined && (product.id === "fmc130" || product.id === "fmc920");
  const trackOn = isFmc && !motionState.reduced && !glFailed;

  // Explode track: progress 0→1 across the page (stage + runway), reset
  // on detach so no explode value leaks into the other products.
  useEffect(() => {
    const el = root.current;
    if (el === null || !trackOn) return undefined;
    return attachProductScroll(el, (t) => {
      const cueEl = cue.current;
      if (cueEl !== null) cueEl.style.opacity = String(Math.max(0, 1 - t * 9));
    });
  }, [trackOn]);

  if (product === undefined) return <div className="page" />;

  return (
    <div className={`page page-products${trackOn ? " page-products-track" : ""}`} ref={root}>
      <section
        className="product-stage"
        aria-label={isFmc ? `${product.name[l]} — ${PRODUCTS_PAGE.viewerLabel[l]}` : undefined}
      >
        <div className="copy-block product-panel">
          <p className="kicker mono reveal">{PRODUCTS_PAGE.kicker}</p>
          <h2 className="reveal">{PRODUCTS_PAGE.h2[l]}</h2>
          <p className="lead reveal">{PRODUCTS_PAGE.lead[l]}</p>

          {/* Product switcher */}
          <div className="seg reveal" role="group" aria-label={PRODUCTS_PAGE.switchLabel[l]}>
            {PRODUCTS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`seg-btn${p.id === active ? " active" : ""}`}
                aria-pressed={p.id === active}
                onClick={() => {
                  setProduct(p.id);
                }}
              >
                {p.name[l]}
              </button>
            ))}
          </div>

          {/* Active product */}
          <div className="product-info" key={product.id}>
            <p className="kicker mono">{product.kicker}</p>
            <h3 className="product-name">{product.name[l]}</h3>
            <p className="mono product-tag" dir="ltr">
              {product.tag}
            </p>
            <p className="lead">{product.blurb[l]}</p>

            {product.chips !== undefined && (
              <div className="chips" style={{ marginTop: 14 }}>
                {product.chips.map((chip) => (
                  <span className="chip" key={chip.en}>
                    {chip[l]}
                  </span>
                ))}
              </div>
            )}

            <p className="spec-title">{PRODUCTS_PAGE.specsTitle[l]}</p>
            <ul className="spec-list">
              {product.callouts.map((c) => (
                <li className="spec-row" key={c.id}>
                  <span className="mono spec-tag" dir="ltr">
                    {c.tag}
                  </span>
                  <span className="spec-desc">{c.desc[l]}</span>
                  <span className="mono spec-spec" dir="ltr">
                    {c.spec}
                  </span>
                </li>
              ))}
            </ul>

            <div className="cta-row">
              <a className="btn primary" href={hrefFor("requests")}>
                {l === "ar" ? "اطلب عرض سعر" : "Request a quote"}
              </a>
              <a className="btn" href={hrefFor("support")}>
                {l === "ar" ? "الدعم الفني" : "Technical support"}
              </a>
            </div>
          </div>
        </div>

        {/* Teardown invitation — parked at the stage's foot, faded out by
            the scroll listener on the first wheel tick. */}
        {trackOn && (
          <div className="scroll-cue" ref={cue} aria-hidden="true">
            <span>{PRODUCTS_PAGE.explodeCue[l]}</span>
            <span className="mono">SCROLL</span>
            <span className="cue-line" />
          </div>
        )}

        {/* 3D layer gone (blocklisted GPU, context exhaustion): a static
            shot of the device keeps the product visual on the page. */}
        {glFailed && isFmc && STATIC_SHOTS[product.id] !== undefined && (
          <img className="product-fallback" src={STATIC_SHOTS[product.id]} alt={product.name[l]} />
        )}
      </section>

      {/* The explode runway: pure scroll travel — the pinned stage above
          plays the teardown across it. Height = RUNWAY_SVH (productScroll). */}
      {trackOn && (
        <div
          className="explode-runway"
          style={{ height: `${String(RUNWAY_SVH)}svh` }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
