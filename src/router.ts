import { useSyncExternalStore } from "react";

/**
 * Hash router — the same contract as the theme and locale stores: a tiny
 * module-level singleton with useSyncExternalStore, zero dependencies on
 * any other app module (content/theme/locale all may import the Route type
 * FROM here; this file imports nothing of theirs — strictly acyclic).
 *
 *  · Hash-based (`#/products`) so the SPA deep-links and refreshes work on
 *    any static host with no rewrite rules, and navigation never reloads
 *    the document — theme, locale and the WebGL context all survive.
 *  · Unknown or empty hashes resolve to home rather than a 404 view: the
 *    app is a brochure, never a dead end.
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

function parse(hash: string): Route {
  const path = hash.replace(/^#/, "").replace(/\/+$/, "") || "/";
  if (path === ROUTE_PATHS.products) return "products";
  if (path === ROUTE_PATHS.support) return "support";
  if (path === ROUTE_PATHS.requests) return "requests";
  return "home";
}

const listeners = new Set<() => void>();

let route: Route = typeof window !== "undefined" ? parse(window.location.hash) : "home";

if (typeof window !== "undefined") {
  window.addEventListener("hashchange", () => {
    const next = parse(window.location.hash);
    if (next === route) return;
    route = next;
    listeners.forEach((listener) => {
      listener();
    });
  });
}

export function getRoute(): Route {
  return route;
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

export function subscribeRoute(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribeRoute, getRoute);
}
