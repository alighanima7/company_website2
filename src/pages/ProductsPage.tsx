import { useEffect, useRef } from "react";
import type { JSX, PointerEvent as ReactPointerEvent } from "react";

import { productKicker, PRODUCTS_PAGE, VISIBLE_PRODUCTS } from "../content";
import { useLocale } from "../locale";
import { motionState } from "../motion";
import { beginDrag, dragRotate, endDrag, showroomState } from "../showroom";
import { attachProductScroll, RUNWAY_SVH } from "../productScroll";
import { setProduct } from "../productState";
import type { ProductId } from "../productState";
import { hrefFor, showroomHref, useProductParam } from "../router";
import { usePhoneLayout } from "../responsive";
import { useSceneFailed } from "../three/SceneBoundary";
import { useTheme } from "../theme";
import { initReveals } from "../ui/reveal";
import { ShowroomPage, showroomHandoff } from "./ShowroomPage";

/** Theme-aware poster set (baked from the GLBs by `npm run posters`) —
 *  the detail pages' stand-in when the WebGL layer has crashed. */
function posterFor(id: ProductId, mode: "light" | "dark"): string {
  return `/posters/${id}-${mode}.webp`;
}

/** Pixels of pin travel over which the phone stage fades as it leaves at
 *  the page footer. Shorter than the clearance between the model's lowest
 *  point and the band's lower edge (58px at 360x740, the tightest size
 *  measured), so the fade always finishes first. */
const STAGE_EXIT_PX = 40;

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
  const phone = usePhoneLayout();
  const dragState = useRef({ id: -1, x: 0, y: 0, v: 0, t: 0 });

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

  /* Phone only: the interaction rig owns yaw here, exactly as it does on
     the showroom, so every scene hands over its clock spin instead of
     turning under the user's finger. */
  useEffect(() => {
    if (!phone) return undefined;
    showroomState.active = true;
    return () => {
      showroomState.active = false;
      showroomState.yaw = 0;
      showroomState.pitch = 0;
      showroomState.yawV = 0;
      showroomState.pitchV = 0;
    };
  }, [phone, id]);

  /* The canvas is clipped to the band (styles.css), and the band is NOT
     always at the top of the viewport: the page footer ends the pin's
     sticky range, so at the foot of the page the band slides up and out.
     A clip fixed to the viewport would keep painting the model where the
     lede has already moved over it, so publish the band's real bottom
     edge and let the clip follow it. */
  useEffect(() => {
    if (!phone) return undefined;
    const root = document.documentElement;
    const apply = (): void => {
      const band = document.querySelector(".page-detail-phone .product-stage");
      if (band === null) return;
      const r = band.getBoundingClientRect();
      root.style.setProperty("--band-bottom", `${Math.max(0, r.bottom).toFixed(1)}px`);
      /* How far the band has been pushed up out of its resting place.
         Clipping alone would slice the model with a hard horizontal cut
         as the stage leaves, so fade it out across the first stretch of
         that travel — the gap between the model's lowest point and the
         band's edge is wider than STAGE_EXIT_PX on every phone size
         measured, so the model is gone before any cut could show. */
      const slid = r.height - r.bottom;
      const f = Math.max(0, Math.min(1, 1 - slid / STAGE_EXIT_PX));
      root.style.setProperty(
        "--stage-dim",
        motionState.reduced ? (f > 0.5 ? "1" : "0") : f.toFixed(3),
      );
    };
    apply();
    window.addEventListener("scroll", apply, { passive: true });
    window.addEventListener("resize", apply);
    return () => {
      window.removeEventListener("scroll", apply);
      window.removeEventListener("resize", apply);
      root.style.removeProperty("--band-bottom");
      root.style.removeProperty("--stage-dim");
    };
  }, [phone, id]);

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

  const drag = dragState.current;
  const onGrabDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* pointer already lifted — rotation still works without capture */
    }
    drag.id = e.pointerId;
    drag.x = e.clientX;
    drag.y = e.clientY;
    drag.v = 0;
    drag.t = performance.now();
    beginDrag();
  };
  const onGrabMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (drag.id !== e.pointerId) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag.x = e.clientX;
    drag.y = e.clientY;
    const now = performance.now();
    const dt = Math.max(1, now - drag.t);
    drag.t = now;
    drag.v = drag.v * 0.7 + ((dx * 0.0075) / dt) * 1000 * 0.3;
    dragRotate(dx, dy);
  };
  const onGrabUp = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (drag.id !== e.pointerId) return;
    drag.id = -1;
    endDrag(drag.v);
  };

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

  /* ── Phone layout (<=820px) ────────────────────────────────────────
     Stacked and borderless. The pinned block is the stage band (the
     model's reserved zone, transparent so the fixed canvas shows through)
     plus an OPAQUE lede strip carrying the back link, kicker, name and
     tag. That strip is what makes "never covered by text" structurally
     true: the spec flow scrolls up and disappears behind it, so nothing
     can ever reach the transparent band above. Both live inside
     .explode-track, so the spec flow's own height is what the stage
     sticks across — and for explodable products it is also the explode
     travel, which is why the phone runway is shorter than the desktop
     one. */
  if (phone) {
    return (
      <div
        className={`page page-products page-detail page-detail-phone${
          trackOn ? " page-products-track" : ""
        }`}
        ref={root}
      >
        {/* The pin is a DIRECT child of the page, so `position: sticky`
            is scoped by the page's full height: the model band holds at
            the top for the whole route and the spec flow scrolls behind
            it, which is the brief's "page scrolls under the sticky
            stage". The lede rides with it, and because it is opaque it
            is also the reason no flowing text can ever reach the
            transparent band above — and the reason nothing collides
            with the fixed brand mark the way scrolling text did. */}
        <div className="detail-pin">
          <section
            className="product-stage"
            aria-label={isFmc ? `${product.name[l]} — ${PRODUCTS_PAGE.viewerLabel[l]}` : undefined}
          >
            {glFailed ? (
              <img
                className="product-fallback"
                src={posterFor(product.id, mode)}
                alt={product.name[l]}
              />
            ) : (
              <div
                className="detail-grab"
                aria-hidden="true"
                onPointerDown={onGrabDown}
                onPointerMove={onGrabMove}
                onPointerUp={onGrabUp}
                onPointerCancel={onGrabUp}
              />
            )}
            {trackOn && (
              <div className="scroll-cue" ref={cue} aria-hidden="true">
                <span>{PRODUCTS_PAGE.explodeCue[l]}</span>
                <span className="mono">SCROLL</span>
                <span className="cue-line" />
              </div>
            )}
          </section>

          <div className="detail-lede">
            {back}
            <p className="kicker mono">{productKicker(product)}</p>
            <h2 className="detail-name" tabIndex={-1} ref={title}>
              {product.name[l]}
            </h2>
            <p className="mono product-tag" dir="ltr">
              {product.tag}
            </p>
          </div>
        </div>

        {/* Explodable only: the runway the explode is scrubbed across.
            attachProductScroll maps scrollY over the track's extent from
            the document top, so the runway keeps driving the explode
            exactly as before — the only change is that the stage no
            longer stops being sticky when the track ends. */}
        {trackOn && (
          <div className="explode-track" ref={track}>
            <div className="explode-runway" aria-hidden="true" />
          </div>
        )}

        <section className="detail-flow">
          <p className="lead">{product.blurb[l]}</p>
          {details}
        </section>
      </div>
    );
  }

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
