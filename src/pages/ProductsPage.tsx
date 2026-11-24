import { useEffect, useRef, useState } from "react";
import type { JSX } from "react";

import { productKicker, PRODUCTS_PAGE, VISIBLE_PRODUCTS } from "../content";
import { useLocale } from "../locale";
import { motionState } from "../motion";
import { attachProductScroll, RUNWAY_SVH } from "../productScroll";
import { setProduct } from "../productState";
import type { ProductId } from "../productState";
import { hrefFor, hrefForProduct, navigate, useProductParam } from "../router";
import { preloadFmc } from "../three/FmcDevice";
import { useSceneFailed } from "../three/SceneBoundary";
import { preloadSimple } from "../three/SimpleDevice";
import { initReveals } from "../ui/reveal";

/** Static product shots (baked from the real models) that stand in for
 *  the FMC viewers when the WebGL layer has crashed. */
const STATIC_SHOTS: Partial<Record<string, string>> = {
  fmc130: "/images/fmc130-static.webp",
  fmc920: "/images/fmc920-static.webp",
};

/** Products whose GLB ships a real part split — these get the pinned
 *  stage + runway teardown. Everything else is a plain document. */
function hasTeardown(id: ProductId): id is "fmc130" | "fmc920" | "galileosky" {
  return id === "fmc130" || id === "fmc920" || id === "galileosky";
}

/** Warm the heavy GLB for a product that is about to come into view.
 *  Products with procedural scenes have nothing to fetch. */
function warm(id: ProductId): void {
  if (id === "fmc130" || id === "fmc920" || id === "galileosky") preloadFmc(id);
  else if (id === "galileosky10") preloadSimple(id);
}

/* ── Cross-mode memory ────────────────────────────────────────────────
   Browse and detail are different components on the same route, so React
   unmounts one to mount the other. These two module-level values are the
   only thread between them: where the browse sequence was parked, and
   which card sent the visitor into detail (so focus can be handed back).
   ProductsPage clears both when the route leaves products entirely —
   otherwise a later visit would restore a stale offset. */
let browseScrollY = 0;
let returnTo: ProductId | null = null;
/** True once the visitor has actually left the browse sequence for a
 *  detail view. Arriving straight at a detail URL leaves it false, so
 *  that case does NOT steal focus on first paint — the same courtesy
 *  App.tsx extends with its firstRoute guard. */
let openedFromBrowse = false;

/**
 * Products — the lineup as a scroll sequence (browse) plus one view per
 * product (detail), switched by the URL alone:
 *
 *  · `#/products`          browse: one viewport-tall segment per VISIBLE
 *    product, each a compact card, with the persistent Stage canvas
 *    swapping to that product's showcase as its segment takes the
 *    viewport. Hidden products are absent from every list here.
 *  · `#/products/<id>`     detail: that product on its own. Devices whose
 *    GLB ships a real part split keep the scroll-driven teardown — a
 *    pinned stage over a runway — with the spec table as a normal section
 *    below it; single-mesh products are a plain document.
 *
 * The two scroll-driven systems can never run together: the browse
 * scroll-spy lives only in ProductsBrowse, and attachProductScroll is
 * called only from ProductDetail. Different components on different URLs,
 * so the exclusivity is structural rather than a runtime guard.
 */
export function ProductsPage(): JSX.Element {
  const detailId = useProductParam();

  // Leaving the products route altogether: forget where browse was and
  // who opened what, so the next visit starts clean.
  useEffect(
    () => () => {
      browseScrollY = 0;
      returnTo = null;
    },
    [],
  );

  return detailId === null ? <ProductsBrowse /> : <ProductDetail id={detailId} />;
}

/* ── Browse ──────────────────────────────────────────────────────────── */

/** How long a segment must hold the viewport midline before the canvas
 *  commits to it. The rail and aria-current update immediately; only the
 *  expensive part (mounting a showcase, decoding a multi-megabyte GLB) is
 *  deferred, so a fast flick through the lineup doesn't thrash the GPU. */
const COMMIT_MS = 160;

function ProductsBrowse(): JSX.Element {
  const l = useLocale();
  const root = useRef<HTMLDivElement | null>(null);
  const committed = useRef<number | undefined>(undefined);
  // Which segment owns the viewport — DOM-side only, so the rail responds
  // on the same frame as the scroll.
  const [active, setActive] = useState<ProductId>(() => VISIBLE_PRODUCTS[0]?.id ?? "tracker");

  useEffect(() => {
    const el = root.current;
    return el === null ? undefined : initReveals(el);
  }, []);

  // Restore the sequence where the visitor left it, and hand focus back to
  // the card that opened the detail view.
  useEffect(() => {
    if (returnTo === null) return;
    const id = returnTo;
    returnTo = null;
    if (browseScrollY > 0) {
      window.scrollTo(0, browseScrollY);
    } else {
      // Arrived straight at a detail URL and then went back — there is no
      // remembered offset, so put that product's segment on screen rather
      // than parking focus somewhere invisible.
      document.querySelector(`.browse-seg[data-product="${id}"]`)?.scrollIntoView();
    }
    setActive(id);
    setProduct(id);
    document
      .querySelector<HTMLAnchorElement>(`.product-card[data-product="${id}"] .card-cta`)
      ?.focus({ preventScroll: true });
  }, []);

  // Scroll-spy: rootMargin collapses the viewport to its midline, so
  // exactly one segment can satisfy the observer at a time.
  useEffect(() => {
    const el = root.current;
    if (el === null) return undefined;

    const onScroll = (): void => {
      browseScrollY = window.scrollY;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    // Unmounting browse means a detail view is opening from here, so that
    // view may take focus.
    const markOpened = (): void => {
      openedFromBrowse = true;
    };

    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.find((e) => e.isIntersecting);
        if (hit === undefined) return;
        const id = hit.target.getAttribute("data-product") as ProductId | null;
        if (id === null) return;
        setActive(id);
        window.clearTimeout(committed.current);
        committed.current = window.setTimeout(() => {
          setProduct(id);
          // Warm the NEXT device's GLB while this segment reads, so the
          // heavy fetches spread across the scroll instead of landing
          // together on page entry.
          const next = VISIBLE_PRODUCTS[VISIBLE_PRODUCTS.findIndex((p) => p.id === id) + 1];
          if (next !== undefined) warm(next.id);
        }, COMMIT_MS);
      },
      { rootMargin: "-50% 0px -50% 0px", threshold: 0 },
    );
    el.querySelectorAll(".browse-seg").forEach((s) => {
      io.observe(s);
    });

    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.clearTimeout(committed.current);
      markOpened();
    };
  }, []);

  return (
    <div className="page page-products page-browse" ref={root}>
      {/* Lead-in. The page-level kicker is deliberately not rendered here:
          it numbers by nav order ("02 // PRODUCT LINEUP") and would sit
          directly above the products' own 01..NN run. */}
      <section className="products-intro">
        <div className="copy-block intro-block">
          <h2 className="reveal">{PRODUCTS_PAGE.h2[l]}</h2>
          <p className="lead reveal">{PRODUCTS_PAGE.lead[l]}</p>
        </div>
      </section>

      {VISIBLE_PRODUCTS.map((p, i) => (
        <section className="browse-seg" key={p.id} data-product={p.id}>
          <article
            className={`copy-block product-card${p.id === active ? " is-active" : ""}`}
            data-product={p.id}
          >
            <p className="kicker mono">{productKicker(p)}</p>
            <h3 className="card-name">{p.name[l]}</h3>
            <p className="mono card-tag" dir="ltr">
              {p.tag}
            </p>
            <p className="card-blurb">{p.blurb[l]}</p>
            <a className="btn primary card-cta" href={hrefForProduct(p.id)}>
              {PRODUCTS_PAGE.detailsCta[l]}
              <span className="sr-only"> — {p.name[l]}</span>
            </a>
          </article>

          <p className="seg-count mono" aria-hidden="true" dir="ltr">
            {String(i + 1).padStart(2, "0")}
            <span className="seg-count-total">/{String(VISIBLE_PRODUCTS.length).padStart(2, "0")}</span>
          </p>
        </section>
      ))}

      {/* Position indicator + jump links. Hidden below 768px, where the
          card's own 01–05 kicker carries the same information. */}
      <nav className="product-rail" aria-label={PRODUCTS_PAGE.switchLabel[l]}>
        {VISIBLE_PRODUCTS.map((p, i) => (
          <a
            key={p.id}
            className="rail-item"
            href={`#seg-${p.id}`}
            aria-current={p.id === active ? "true" : undefined}
            onClick={(e) => {
              e.preventDefault();
              document
                .querySelector(`.browse-seg[data-product="${p.id}"]`)
                ?.scrollIntoView({ behavior: motionState.reduced ? "auto" : "smooth" });
            }}
          >
            <span className="rail-num mono" dir="ltr">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="rail-name">{p.name[l]}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}

/* ── Detail ──────────────────────────────────────────────────────────── */

function ProductDetail({ id }: { id: ProductId }): JSX.Element {
  const l = useLocale();
  const root = useRef<HTMLDivElement | null>(null);
  const track = useRef<HTMLDivElement | null>(null);
  const title = useRef<HTMLHeadingElement | null>(null);
  const cue = useRef<HTMLDivElement | null>(null);
  const glFailed = useSceneFailed();

  const product = VISIBLE_PRODUCTS.find((p) => p.id === id);
  const isFmc = product !== undefined && hasTeardown(product.id);
  const trackOn = isFmc && !motionState.reduced && !glFailed;

  // The URL is the source of truth for which showcase is on the canvas.
  useEffect(() => {
    setProduct(id);
    returnTo = id;
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
    if (openedFromBrowse) title.current?.focus({ preventScroll: true });
  }, [id]);

  // Escape returns to the sequence — same destination as the back link
  // and the browser's own Back button.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") navigate("products");
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, []);

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
    <a className="back-link" href={hrefFor("products")}>
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
        <a className="btn primary" href={hrefFor("requests")}>
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

          {glFailed && isFmc && STATIC_SHOTS[product.id] !== undefined && (
            <img className="product-fallback" src={STATIC_SHOTS[product.id]} alt={product.name[l]} />
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
