import { clamp01, dampK, motionState, phase } from "./motion";
import { FLAGS, timedCall } from "./perf/probe";
import { viewport } from "./responsive";

/**
 * Products-route scroll progress — the exploded-view's one input.
 *
 * Same route-scoped contract as homeScroll (deliberately NOT a global
 * scroll system): ProductsPage attaches the listener only while an FMC
 * product is active and detaches on switch/unmount, and the only consumer
 * (FmcDevice) is mounted for exactly those products — every other page
 * stays a plain document with zero scroll coupling.
 *
 *  · `target` is the raw progress (0..1) across the explode track (the
 *    page top → the moment the runway's bottom reaches the viewport
 *    bottom). 0 = assembled, 1 = fully exploded.
 *  · `current` is the frame-damped copy the 3D side reads; FmcDevice
 *    damps it once per frame with the shared dt-normalized convergence
 *    law, so scrolling back re-assembles along the exact same curve.
 *  · Reduced motion never reaches here — the page renders no runway and
 *    attaches no listener; the scene pins itself to the assembled pose.
 */

/** Explode-track travel: the runway section's height in svh (the sticky
 *  stage adds one more viewport on top). More svh = a slower, more
 *  cinematic scrub per scroll tick; less = snappier. Tune it here —
 *  ProductsPage sizes the runway from this single constant. */
export const RUNWAY_SVH = 300;

/**
 * Browse-mode track height per product, in svh. Each browse segment is a
 * track this tall with a sticky stage inside it, so the card stays put
 * while the model animates across `track − 100svh` of scroll.
 *
 * TUNE HERE. Total page length is intro(70) + Σ tracks + footer(~18):
 * 215 each gives 1378svh ≈ 13.8 viewports. The value is set by the TURN,
 * not the teardown: one revolution across `track − 100svh` of travel is
 * ~45°/100px at 215, which is brisk but readable. Shortening these speeds
 * the rotation up proportionally (170svh ≈ 74°/100px, uncomfortable).
 * Products not listed fall back to BROWSE_TRACK_DEFAULT_SVH.
 */
export const BROWSE_TRACK_SVH: Readonly<Record<string, number>> = {
  tracker: 215,
  city: 215,
  fmc130: 215,
  fmc920: 215,
  galileosky: 215,
  galileosky10: 215,
};
export const BROWSE_TRACK_DEFAULT_SVH = 215;

/* ── Browse turn ──────────────────────────────────────────────────────
   One full revolution per segment, driven by raw scroll progress.

   360° is not a style choice: "never reverses" + "front-facing at both
   entry and exit" together admit only a whole number of turns. Anything
   less either doubles back (the old sweeps did, which is what made them
   unpleasant) or leaves the model off-front when the scene swaps.         */

/** Total rotation across one segment. A multiple of 2π or the model will
 *  not be square-on at the boundary. */
export const BROWSE_TURN = Math.PI * 2;

/** Where the turn pauses, as a fraction of the full revolution, and the
 *  progress window over which it is (near) stationary. The window
 *  straddles the explode peak so the device is NOT spinning at speed when
 *  its parts are furthest apart.
 *
 *  0.5 parks it back-on at that moment. That is deliberate: the back is
 *  dimmed (see BACK_DIM), and it is the only value that keeps both legs
 *  near the chosen ~45°/100px. Turning the pause toward a three-quarter
 *  view costs a great deal of speed on the first leg — at this track
 *  height, 0.875 (a 45° three-quarter) runs the first leg at 94°/100px,
 *  peaking near 141, which is worse than the motion this change set out
 *  to fix. Raise it only together with BROWSE_TRACK_SVH. */
export const YAW_HOLD_AT = 0.5;
/** Kept narrow on purpose: every unit of pause has to be paid for by the
 *  two legs, which raises their peak rate. [0.42,0.58] costs ~13°/100px
 *  of peak over no pause at all (80 vs 67) and still gives ~128px of
 *  near-stillness around the explode peak. */
export const YAW_HOLD_WINDOW: readonly [number, number] = [0.42, 0.58];

/** How far the device fades toward the stage colour when fully back-on
 *  (0 = never dim, 1 = fully absorbed), plus the angular window over
 *  which the fade ramps in, measured in radians away from fully back-on.
 *
 *  Two of the six source models have a hallucinated back face baked into
 *  their TEXTURE — a garbled label on FMC920, mirrored branding on
 *  Galileosky 10. This REDUCES how readable that is; measured, it does
 *  not eliminate it (see TURN_EXCLUDE). */
export const BACK_DIM = 0.7;
export const BACK_DIM_START = 0.55;
export const BACK_DIM_END = 1.45;

/**
 * Products that do NOT turn in browse — they hold their front pose and
 * rely on their explode / emissive for motion instead.
 *
 * MEASURED LIMITATION: the dim above reduces the hallucinated back faces
 * a long way but does NOT make them illegible. The mirrored "GALILEOSKY"
 * and FMC920's garbled label are painted into the albedo atlas, and every
 * uniform colour operation preserves the contrast between white text and
 * a dark body. Transparency is worse still (these shells are doubleSided,
 * so fading them reveals the real front label from the inside).
 *
 * If the mirrored artwork is unacceptable, put the two ids in here — that
 * is the whole fix, and the only other real option is repainting the two
 * texture atlases:
 *     ["fmc920", "galileosky10"]
 */
export const TURN_EXCLUDE: readonly string[] = [];

/**
 * Turn curve: monotonic 0→1, eased to a stop at both ends, with a pause
 * across YAW_HOLD_WINDOW. Never decreasing, so the rotation can never
 * reverse at any scroll position.
 */
export function browseTurn(p: number): number {
  const [a, b] = YAW_HOLD_WINDOW;
  if (p <= a) return YAW_HOLD_AT * phase(p, 0, a);
  if (p >= b) return YAW_HOLD_AT + (1 - YAW_HOLD_AT) * phase(p, b, 1);
  return YAW_HOLD_AT;
}

/** 0 while the device faces the viewer, 1 when it is fully back-on. */
export function backFacing(turnRadians: number): number {
  const tau = Math.PI * 2;
  const wrapped = ((turnRadians % tau) + tau) % tau;
  // Angular distance from π (fully back-on): 0 at the back, π at the front.
  const offBack = Math.abs(wrapped - Math.PI);
  return 1 - phase(offBack, BACK_DIM_START, BACK_DIM_END);
}

/** Browse peaks at a fraction of the full animation: detail mode stays
 *  the only place the teardown opens all the way, so the two modes don't
 *  read as the same effect twice. */
export const BROWSE_PEAK = 0.7;

/** Fraction of a segment after which the NEXT product's assets are warmed,
 *  so the swap at the segment boundary doesn't stall on a decode. */
export const BROWSE_WARM_AT = 0.6;

/**
 * The scrub every mounted showcase reads.
 *
 *  · `target` / `current` — the EXPLODE value and its frame-damped copy.
 *    In browse this is the out-and-back triangle; in detail it is the
 *    runway's monotonic 0→1.
 *  · `turn` / `turnCurrent` — the browse rotation, 0→1 of a full
 *    revolution, and its damped copy. Kept separate from `current`
 *    precisely because it must NOT follow the triangle: the explode
 *    reverses by design, the rotation must never reverse. Detail mode
 *    leaves it at 0 and keeps its own yaw behaviour.
 *  · `driven` — whether a scroll driver is currently attached. Scenes that
 *    also have a clock-based idle (tracker, city, galileosky10) use it to
 *    decide which they are on: scroll-driven inside a browse track, their
 *    own clock in detail mode, where those products have no runway.
 */
export const productScroll = { target: 0, current: 0, turn: 0, turnCurrent: 0, driven: false };

/**
 * Browse curve: 0 at the track's start, 1 at its middle, 0 again at its
 * end. The model is therefore ASSEMBLED whenever a segment boundary — and
 * so the scene swap — happens, and the whole thing is a pure function of
 * scroll position, so it reverses exactly.
 */
export function browseCurve(p: number): number {
  return phase(p, 0.12, 0.5) * (1 - phase(p, 0.5, 0.88));
}

const DAMP_BASE_POINTER = 0.0001; // remaining fraction after exactly 1s
const DAMP_BASE_TOUCH = 0.000001;

/** Damp `current` toward `target`; called once per frame by the mounted
 *  FMC showcase (dt is clamped inside dampK, so a tab-switch hitch
 *  converges over a few frames instead of teleporting). */
export function dampProductScroll(dt: number): number {
  if (motionState.reduced) {
    productScroll.current = productScroll.target;
    productScroll.turnCurrent = productScroll.turn;
    return productScroll.current;
  }
  const k = dampK(viewport.coarse ? DAMP_BASE_TOUCH : DAMP_BASE_POINTER, dt);
  productScroll.current += (productScroll.target - productScroll.current) * k;
  // Same convergence law for the rotation. Damping a MONOTONIC target can
  // only ever lag it, never overshoot into a reversal — unlike the old
  // triangle-driven yaw, where the target's derivative flipped sign at the
  // peak and the damper bounced through it.
  productScroll.turnCurrent += (productScroll.turn - productScroll.turnCurrent) * k;
  return productScroll.current;
}

/** The damped browse rotation, in radians. Call after dampProductScroll. */
export function productTurn(): number {
  return productScroll.turnCurrent * BROWSE_TURN;
}

/**
 * Start tracking: progress runs 0→1 from the document top to the moment
 * `trackEl`'s bottom edge reaches the viewport bottom (the products page
 * root, whose runway section sizes the travel). Returns the detach
 * function; detaching also resets the state so no explode value leaks
 * into other products or a later visit.
 */
export function attachProductScroll(
  trackEl: HTMLElement,
  onUpdate?: (t: number) => void,
): () => void {
  const onScroll = timedCall("scroll:detail", (): void => {
    const end = Math.max(1, trackEl.offsetTop + trackEl.offsetHeight - window.innerHeight);
    productScroll.target = clamp01(window.scrollY / end);
    // Detail mode keeps its own yaw (openYaw); no browse revolution here.
    productScroll.turn = 0;
    onUpdate?.(productScroll.target);
  });
  onScroll();
  // A restored scroll position (reload mid-track) starts the teardown ON
  // its beat instead of flying there from zero.
  productScroll.current = productScroll.target;
  productScroll.driven = true;
  // ?noscroll=1 - bind no listener, but leave `driven` set, so the scenes
  // stay on exactly the branch they normally take and only the per-event
  // handler cost disappears. Changing `driven` would switch them to their
  // clock idles and measure a different scene.
  if (FLAGS.noscroll) {
    return () => {
      productScroll.target = 0;
      productScroll.current = 0;
      productScroll.turn = 0;
      productScroll.turnCurrent = 0;
      productScroll.driven = false;
    };
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  return () => {
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onScroll);
    productScroll.target = 0;
    productScroll.current = 0;
    productScroll.turn = 0;
    productScroll.turnCurrent = 0;
    productScroll.driven = false;
  };
}

/**
 * Browse-mode driver: the same scrub store, fed per SEGMENT instead of
 * per page.
 *
 * Progress runs 0→1 across one track's pinned travel — 0 the moment the
 * track's top reaches the viewport top (card in place, model assembled),
 * 1 when its bottom reaches the viewport bottom — then `browseCurve`
 * turns that into the out-and-back the scenes actually play. Over exactly
 * that span the viewport midline sits inside the same track, so this
 * agrees with ProductsBrowse's IntersectionObserver by construction and
 * the two can never disagree about which product is live.
 *
 * `onSegment` reports (id, p) so the page can warm the next product's
 * assets partway through. Reduced motion never attaches this at all.
 */
export function attachBrowseScroll(
  root: HTMLElement,
  onSegment?: (id: string, p: number) => void,
): () => void {
  const onScroll = timedCall("scroll:browse", (): void => {
    const segments = root.querySelectorAll<HTMLElement>(".browse-seg");
    const y = window.scrollY;
    const mid = y + window.innerHeight / 2;
    let live: HTMLElement | null = null;
    for (const el of segments) {
      if (mid >= el.offsetTop && mid < el.offsetTop + el.offsetHeight) {
        live = el;
        break;
      }
    }
    if (live === null) {
      // Between the intro and the first track, or past the last one.
      productScroll.target = 0;
      productScroll.turn = 0;
      return;
    }
    const travel = Math.max(1, live.offsetHeight - window.innerHeight);
    const p = clamp01((y - live.offsetTop) / travel);
    productScroll.target = BROWSE_PEAK * browseCurve(p);
    // Rotation rides RAW progress, not the triangle — that is the whole
    // point: one direction, start to finish, square-on at both ends.
    const segId = live.getAttribute("data-product");
    productScroll.turn = segId !== null && TURN_EXCLUDE.includes(segId) ? 0 : browseTurn(p);
    if (segId !== null) onSegment?.(segId, p);
  });

  onScroll();
  productScroll.current = productScroll.target;
  productScroll.driven = true;
  // ?noscroll=1 - see attachProductScroll: listener off, `driven` kept.
  if (FLAGS.noscroll) {
    return () => {
      productScroll.target = 0;
      productScroll.current = 0;
      productScroll.turn = 0;
      productScroll.turnCurrent = 0;
      productScroll.driven = false;
    };
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  return () => {
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onScroll);
    productScroll.target = 0;
    productScroll.current = 0;
    productScroll.turn = 0;
    productScroll.turnCurrent = 0;
    productScroll.driven = false;
  };
}
