import { useSyncExternalStore } from "react";

/**
 * Active-product selection — shared between the Products page DOM (the
 * switcher + spec panel) and the Stage canvas (which 3D showcase is
 * mounted). Same singleton store pattern as theme/locale/router; imports
 * nothing, so the DOM side and the canvas side stay decoupled.
 */

/** The lineup's order — also the browse sequence and the router's set of
 *  valid `#/products/<id>` segments. One source of truth; still imports
 *  nothing, so the router may depend on it without creating a cycle. */
export const PRODUCT_IDS = ["tracker", "collar", "city", "fmc130", "fmc920"] as const;

export type ProductId = (typeof PRODUCT_IDS)[number];

/** Narrows a raw URL segment. Anything else is not a product. */
export function isProductId(value: string): value is ProductId {
  return (PRODUCT_IDS as readonly string[]).includes(value);
}

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
