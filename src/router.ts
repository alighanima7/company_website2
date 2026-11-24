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
 *  · Products carries ONE optional sub-segment: `#/products` is the browse
 *    sequence, `#/products/fmc130` is that product's detail view. Both
 *    report route "products", so the Stage's camera pose, the nav's active
 *    link and App's route effects never see a mode switch — only
 *    ProductsPage reads the segment.
 *  · Unknown or empty hashes resolve to home rather than a 404 view (the
 *    app is a brochure, never a dead end); an unknown PRODUCT segment
 *    resolves to the browse sequence rather than throwing the visitor out
 *    to home.
 *  · navigate() is the ONLY writer; the hashchange listener keeps the
 *    store honest for back/forward and hand-typed URLs.
 */

export type Route = "home" | "products" | "support" | "requests";

export const ROUTE_PATHS: Record<Route, string> = {
  home: "/",
  products: "/products",
  support: "/support",
  requests: "/requests-about",
};

/** The parsed hash: a route plus, for products only, an optional product. */
interface Location {
  readonly route: Route;
  readonly product: ProductId | null;
}

function parse(hash: string): Location {
  const path = hash.replace(/^#/, "").replace(/\/+$/, "") || "/";
  if (path === ROUTE_PATHS.products) return { route: "products", product: null };
  if (path.startsWith(`${ROUTE_PATHS.products}/`)) {
    const segment = path.slice(ROUTE_PATHS.products.length + 1);
    // Validated against the VISIBLE lineup: a hidden product's id is not a
    // route, so it falls back to the sequence like any unknown segment.
    return { route: "products", product: isVisibleProductId(segment) ? segment : null };
  }
  if (path === ROUTE_PATHS.support) return { route: "support", product: null };
  if (path === ROUTE_PATHS.requests) return { route: "requests", product: null };
  return { route: "home", product: null };
}

const listeners = new Set<() => void>();

let location: Location =
  typeof window !== "undefined"
    ? parse(window.location.hash)
    : { route: "home", product: null };

if (typeof window !== "undefined") {
  window.addEventListener("hashchange", () => {
    const next = parse(window.location.hash);
    if (next.route === location.route && next.product === location.product) return;
    location = next;
    listeners.forEach((listener) => {
      listener();
    });
  });
}

export function getRoute(): Route {
  return location.route;
}

/** The product sub-segment: null means the browse sequence. */
export function getProductParam(): ProductId | null {
  return location.product;
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

/** href for real <a> elements — middle-click, copy-link and a11y all work. */
export function hrefFor(routeName: Route): string {
  return `#${ROUTE_PATHS[routeName]}`;
}

/** href for one product's detail view. Real links mean the browser's Back
 *  button, middle-click and "copy link address" all work with no JS. */
export function hrefForProduct(id: ProductId): string {
  return `#${ROUTE_PATHS.products}/${id}`;
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
