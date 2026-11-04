import { useSyncExternalStore } from "react";

/**
 * Locale system — mirrors the theme store's contract exactly:
 *
 *  · ARABIC is the base locale and the first-visit default (the brand is
 *    Arabic-first); ENGLISH is an explicit choice.
 *  · Only explicit choices persist (localStorage + cookie mirror), read
 *    pre-paint by the inline bootstrap in index.html so the document's
 *    lang/dir are correct before first render — no direction flash.
 *  · Switching flips <html lang dir>, notifies subscribers, then fires a
 *    synthetic resize so the scroll system's hardRefresh re-derives the
 *    phase boundaries for the new text metrics and restores the exact
 *    scroll position — no animation jumps.
 */

export type Locale = "ar" | "en";

/** A bilingual string. Everything user-visible ships both. */
export interface Bi {
  readonly ar: string;
  readonly en: string;
}

export const LOCALE_STORAGE_KEY = "nns.locale.v2";
export const LOCALE_COOKIE = "nns-v2-locale";

const listeners = new Set<() => void>();

let locale: Locale =
  typeof document !== "undefined" && document.documentElement.lang === "en" ? "en" : "ar";

export function getLocale(): Locale {
  return locale;
}

export function setLocale(next: Locale): void {
  if (next === locale) return;
  locale = next;

  const root = document.documentElement;
  root.lang = next;
  root.dir = next === "en" ? "ltr" : "rtl";

  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, next);
  } catch {
    /* storage unavailable — cookie still carries the choice */
  }
  document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; SameSite=Lax`;

  listeners.forEach((listener) => {
    listener();
  });

  // Text metrics changed → section heights changed. The scroll system's
  // debounced refresh re-syncs PHASES, refreshes ScrollTrigger and restores
  // scrollY exactly. (A dedicated event, NOT a synthetic resize: the mobile
  // resize path ignores same-width events to survive URL-bar jitter.)
  window.dispatchEvent(new Event("nns:refresh"));
}

export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useLocale(): Locale {
  return useSyncExternalStore(subscribeLocale, getLocale);
}
