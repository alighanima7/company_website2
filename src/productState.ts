import { useSyncExternalStore } from "react";

/**
 * Active-product selection — shared between the Products page DOM (the
 * switcher + spec panel) and the Stage canvas (which 3D showcase is
 * mounted). Same singleton store pattern as theme/locale/router; imports
 * nothing, so the DOM side and the canvas side stay decoupled.
 */

/** Every product id that EXISTS, in lineup order — including any that are
 *  currently hidden. This is the type's source of truth only; what the
 *  site actually shows is VISIBLE_PRODUCTS in content.ts, and the router
 *  validates URLs against that. Kept here (importing nothing) so the type
 *  stays available to content.ts without a cycle. */
export const PRODUCT_IDS = [
  "tracker",
  "collar",
  "city",
  "fmc130",
  "fmc920",
  "galileosky",
  "galileosky10",
] as const;

export type ProductId = (typeof PRODUCT_IDS)[number];

const listeners = new Set<() => void>();

let product: ProductId = "tracker";

export function getProduct(): ProductId {
  return product;
}

export function setProduct(next: ProductId): void {
  if (next === product) return;
  product = next;
  listeners.forEach((listener) => {
    listener();
  });
}

export function subscribeProduct(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useProduct(): ProductId {
  return useSyncExternalStore(subscribeProduct, getProduct);
}
