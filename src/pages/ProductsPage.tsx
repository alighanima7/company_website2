import { useEffect, useRef } from "react";
import type { JSX } from "react";

import { productKicker, PRODUCTS_PAGE, VISIBLE_PRODUCTS } from "../content";
import { useLocale } from "../locale";
import { motionState } from "../motion";
import { attachProductScroll, RUNWAY_SVH } from "../productScroll";
import { setProduct } from "../productState";
import type { ProductId } from "../productState";
import { hrefFor, showroomHref, useProductParam } from "../router";
import { useSceneFailed } from "../three/SceneBoundary";
import { useTheme } from "../theme";
import { initReveals } from "../ui/reveal";
import { ShowroomPage, showroomHandoff } from "./ShowroomPage";

/** Theme-aware poster set (baked from the GLBs by `npm run posters`) —
 *  the detail pages' stand-in when the WebGL layer has crashed. */
function posterFor(id: ProductId, mode: "light" | "dark"): string {
  return `/posters/${id}-${mode}.webp`;
}

/** Products whose GLB ships a real part split — these get the pinned
 *  stage + runway teardown. Everything else is a plain document. */
function hasTeardown(id: ProductId): id is "fmc130" | "fmc920" | "galileosky" {
  return id === "fmc130" || id === "fmc920" || id === "galileosky";
}

/**
 * Products — the single-screen SHOWROOM plus one view per product
 * (detail), switched by the URL alone:
 *
 *  · `#/products`          showroom: one non-scrolling screen, the active
 *    product staged in 3D with free rotate/zoom, selection via the bottom
 *    strip (`?p=<id>` keeps it shareable). Hidden products are absent
 *    from every list here.
 *  · `#/products/<id>`     detail: that product on its own. Devices whose
 *    GLB ships a real part split keep the scroll-driven teardown — a
 *    pinned stage over a runway — with the spec table as a normal section
 *    below it; single-mesh products are a plain document.
 */
export function ProductsPage(): JSX.Element {
  const detailId = useProductParam();
  return detailId === null ? <ShowroomPage /> : <ProductDetail id={detailId} />;
}

/* ── Detail ──────────────────────────────────────────────────────────── */

function ProductDetail({ id }: { id: ProductId }): JSX.Element {
  const l = useLocale();
  const root = useRef<HTMLDivElement | null>(null);
  const track = useRef<HTMLDivElement | null>(null);
  const title = useRef<HTMLHeadingElement | null>(null);
  const cue = useRef<HTMLDivElement | null>(null);
  const glFailed = useSceneFailed();
  const mode = useTheme();

  const product = VISIBLE_PRODUCTS.find((p) => p.id === id);
  const isFmc = product !== undefined && hasTeardown(product.id);
  const trackOn = isFmc && !motionState.reduced && !glFailed;

  // The URL is the source of truth for which showcase is on the canvas.
  useEffect(() => {
    setProduct(id);
  }, [id]);

  useEffect(() => {
    const el = root.current;
    return el === null ? undefined : initReveals(el);
  }, [id]);

  // Opening a detail view starts at its top and moves focus onto the
  // product's name, so keyboard and screen-reader users land inside the
  // new view rather than wherever the card happened to be. A visitor who
  // arrived straight at this URL gets the scroll but keeps their focus —
  // taking it on first paint would be hostile.
  useEffect(() => {
    window.scrollTo(0, 0);
    if (showroomHandoff.toDetail) {
      showroomHandoff.toDetail = false;
      title.current?.focus({ preventScroll: true });
    }
  }, [id]);

  // Leaving back toward the showroom may hand focus to the strip there.
  useEffect(
    () => () => {
      showroomHandoff.toShowroom = true;
    },
    [],
  );

  // Escape returns to the showroom PARKED ON THIS PRODUCT — the same
  // destination as the back link.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") window.location.hash = showroomHref(id);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [id]);

  // Explode track: progress 0→1 across the pinned stage + runway wrapper.
  // Measuring the WRAPPER (not the page root) is what keeps the teardown
  // identical now that a spec section follows the runway — the travel is
  // still exactly the runway's height.
  useEffect(() => {
    const el = track.current;
    if (el === null || !trackOn) return undefined;
    return attachProductScroll(el, (t) => {
      const cueEl = cue.current;
      if (cueEl !== null) cueEl.style.opacity = String(Math.max(0, 1 - t * 9));
    });
  }, [trackOn, id]);

  if (product === undefined) return <div className="page" />;

  const back = (
    <a className="back-link" href={showroomHref(id)}>
      <span aria-hidden="true" className="back-arrow">
        ←
      </span>
      {PRODUCTS_PAGE.backCta[l]}
    </a>
  );

  const details = (
    <>
      {product.chips !== undefined && (
        <div className="chips">
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
        <a className="btn primary" href={`${hrefFor("requests")}?product=${id}`}>
          {l === "ar" ? "اطلب عرض سعر" : "Request a quote"}
        </a>
        <a className="btn" href={hrefFor("support")}>
          {l === "ar" ? "الدعم الفني" : "Technical support"}
        </a>
      </div>
    </>
  );

  const head = (
    <>
      {back}
      <p className="kicker mono">{productKicker(product)}</p>
      <h2 className="detail-name" tabIndex={-1} ref={title}>
        {product.name[l]}
      </h2>
      <p className="mono product-tag" dir="ltr">
        {product.tag}
      </p>
      <p className="lead">{product.blurb[l]}</p>
    </>
  );

  return (
    <div className={`page page-products page-detail${trackOn ? " page-products-track" : ""}`} ref={root}>
      {/* Pinned stage + runway. The wrapper scopes `position: sticky` so
          the stage releases the moment the teardown ends, letting the spec
          section below scroll normally. */}
      <div className="explode-track" ref={track}>
        <section
          className="product-stage"
          aria-label={isFmc ? `${product.name[l]} — ${PRODUCTS_PAGE.viewerLabel[l]}` : undefined}
        >
          <div className="copy-block product-panel detail-panel">
            {head}
            {/* Products without a teardown have no runway to separate the
                head from the specs — they read as one panel. */}
            {!isFmc && details}
          </div>

          {trackOn && (
            <div className="scroll-cue" ref={cue} aria-hidden="true">
              <span>{PRODUCTS_PAGE.explodeCue[l]}</span>
              <span className="mono">SCROLL</span>
              <span className="cue-line" />
            </div>
          )}

          {glFailed && (
            <img className="product-fallback" src={posterFor(product.id, mode)} alt={product.name[l]} />
          )}
        </section>

        {trackOn && (
          <div
            className="explode-runway"
            style={{ height: `${String(RUNWAY_SVH)}svh` }}
            aria-hidden="true"
          />
        )}
      </div>

      {/* The teardown's spec table, after the runway so it has room to be
          read at full size instead of competing with the pinned stage. */}
      {isFmc && (
        <section className="detail-specs">
          <div className="copy-block specs-block">{details}</div>
        </section>
      )}

    </div>
  );
}
