import { useSyncExternalStore } from "react";

import { isVisibleProductId } from "./content";
import type { ProductId } from "./productState";

/**
 * Hash router — the same contract as the theme and locale stores: a tiny
 * module-level singleton with useSyncExternalStore. It depends on content
 * for the set of VISIBLE product segments; content's own imports are all
 * type-only and vanish at build, so the runtime graph stays acyclic and
 * content is fully evaluated before this module parses the first hash.
 *
 *  · Hash-based (`#/products`) so the SPA deep-links and refreshes work on
 *    any static host with no rewrite rules, and navigation never reloads
 *    the document — theme, locale and the WebGL context all survive.
 *  · Products carries ONE optional sub-segment: `#/products` is the
 *    showroom, `#/products/fmc130` is that product's detail view. Both
 *    report route "products", so the Stage's camera pose, the nav's active
 *    link and App's route effects never see a mode switch — only
 *    ProductsPage reads the segment.
 *  · The showroom's SELECTED product travels as a query inside the hash
 *    (`#/products?p=fmc130`), so it is shareable and survives reloads and
 *    Back from a detail view. Selection changes use history.replaceState —
 *    flipping through six products must not bury the Back button under six
 *    entries — with a manual store commit, because replaceState fires no
 *    hashchange. commit() is the ONE writer both paths share.
 *  · Unknown or empty hashes resolve to home rather than a 404 view (the
 *    app is a brochure, never a dead end); an unknown PRODUCT segment
 *    resolves to the showroom rather than throwing the visitor out
 *    to home, and an unknown/hidden `?p=` falls back to the lineup's first.
 */

export type Route = "home" | "products" | "support" | "requests";

export const ROUTE_PATHS: Record<Route, string> = {
  home: "/",
  products: "/products",
  support: "/support",
  requests: "/requests-about",
};

/** The parsed hash: a route plus, for products only, an optional detail
 *  product and an optional showroom selection. */
interface Location {
  readonly route: Route;
  readonly product: ProductId | null;
  /** `?p=` inside the hash — the showroom's selected product. null means
   *  "no explicit selection" (the showroom shows the lineup's first). */
  readonly showroom: ProductId | null;
}

function parse(hash: string): Location {
  const raw = hash.replace(/^#/, "");
  // The hash carries its own query (`#/products?p=x`) — split before any
  // path matching, or every parameterized URL would fall through to home.
  const qIndex = raw.indexOf("?");
  const query = qIndex === -1 ? "" : raw.slice(qIndex + 1);
  const path = (qIndex === -1 ? raw : raw.slice(0, qIndex)).replace(/\/+$/, "") || "/";

  if (path === ROUTE_PATHS.products) {
    const p = new URLSearchParams(query).get("p");
    return {
      route: "products",
      product: null,
      showroom: p !== null && isVisibleProductId(p) ? p : null,
    };
  }
  if (path.startsWith(`${ROUTE_PATHS.products}/`)) {
    const segment = path.slice(ROUTE_PATHS.products.length + 1);
    // Validated against the VISIBLE lineup: a hidden product's id is not a
    // route, so it falls back to the showroom like any unknown segment.
    return {
      route: "products",
      product: isVisibleProductId(segment) ? segment : null,
      showroom: null,
    };
  }
  if (path === ROUTE_PATHS.support) return { route: "support", product: null, showroom: null };
  if (path === ROUTE_PATHS.requests) return { route: "requests", product: null, showroom: null };
  return { route: "home", product: null, showroom: null };
}

const listeners = new Set<() => void>();

let location: Location =
  typeof window !== "undefined"
    ? parse(window.location.hash)
    : { route: "home", product: null, showroom: null };

/** The single store writer — hashchange and setShowroomProduct both land
 *  here, so the two can never disagree about what the URL means. */
function commit(next: Location): void {
  if (
    next.route === location.route &&
    next.product === location.product &&
    next.showroom === location.showroom
  ) {
    return;
  }
  location = next;
  listeners.forEach((listener) => {
    listener();
  });
}

if (typeof window !== "undefined") {
  window.addEventListener("hashchange", () => {
    commit(parse(window.location.hash));
  });
}

export function getRoute(): Route {
  return location.route;
}

/** The product sub-segment: null means the showroom. */
export function getProductParam(): ProductId | null {
  return location.product;
}

/** The showroom's `?p=` selection: null means no explicit selection. */
export function getShowroomProduct(): ProductId | null {
  return location.showroom;
}

/** Imperative navigation (nav bar, in-page CTAs). The hashchange listener
 *  does the store update, so programmatic and browser navigation share one
 *  code path. */
export function navigate(next: Route): void {
  const target = `#${ROUTE_PATHS[next]}`;
  if (window.location.hash === target || (next === "home" && window.location.hash === "")) {
    return;
  }
  window.location.hash = target;
}

/**
 * Select a product in the showroom. replaceState, not a hash assignment:
 * flipping through the lineup must not create a history entry per product
 * (Back always leaves the page), while the URL stays shareable and Back
 * from a detail view re-parses the same selection. replaceState fires no
 * hashchange, so the store is committed manually through the same writer.
 */
export function setShowroomProduct(id: ProductId): void {
  const target = showroomHref(id);
  if (window.location.hash !== target) {
    history.replaceState(null, "", target);
  }
  commit({ route: "products", product: null, showroom: id });
}

/** href for real <a> elements — middle-click, copy-link and a11y all work. */
export function hrefFor(routeName: Route): string {
  return `#${ROUTE_PATHS[routeName]}`;
}

/** href for one product's detail view. Real links mean the browser's Back
 *  button, middle-click and "copy link address" all work with no JS. */
export function hrefForProduct(id: ProductId): string {
  return `#${ROUTE_PATHS.products}/${id}`;
}

/** href for the showroom parked on one product — the detail pages' way
 *  back, and the shareable form of a showroom selection. */
export function showroomHref(id: ProductId): string {
  return `#${ROUTE_PATHS.products}?p=${id}`;
}

export function subscribeRoute(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribeRoute, getRoute);
}

export function useProductParam(): ProductId | null {
  return useSyncExternalStore(subscribeRoute, getProductParam);
}

export function useShowroomProduct(): ProductId | null {
  return useSyncExternalStore(subscribeRoute, getShowroomProduct);
}
