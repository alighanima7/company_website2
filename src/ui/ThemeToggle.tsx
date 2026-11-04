import { useEffect, useRef, useState } from "react";
import type { JSX } from "react";

import { useLocale } from "../locale";
import { CANVAS_COLOR, setTheme, useTheme } from "../theme";
import type { ThemeMode } from "../theme";

/**
 * Glass sun/moon switch. Lives OUTSIDE the aria-hidden HUD (it is a real
 * control, not chrome) and above it (z40). Both icons stay mounted; CSS
 * cross-fades them off the `data-theme` attribute so the swap animates.
 *
 * Switching renders a full-viewport veil in the TARGET canvas color,
 * flips the theme at the veil's peak, then fades it away — the WebGL
 * palette swap (materials, clear color, fog) is instantaneous by nature,
 * and the veil turns that hard cut into one smooth wash. Reduced motion
 * skips the veil and switches instantly.
 */
export function ThemeToggle(): JSX.Element {
  const mode = useTheme();
  const locale = useLocale();
  const dark = mode === "dark";
  const [veil, setVeil] = useState<{ target: ThemeMode; stage: "pre" | "in" | "out" } | null>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    return () => {
      timers.current.forEach((t) => {
        window.clearTimeout(t);
      });
    };
  }, []);

  const switchTo = (target: ThemeMode): void => {
    if (veil !== null) return; // a switch is already in flight
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setTheme(target);
      return;
    }
    // Mount transparent first; promote to .on a frame later so the fade-in
    // actually transitions (an element born with .on pops with no fade).
    setVeil({ target, stage: "pre" });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setVeil((v) => (v === null ? null : { ...v, stage: "in" }));
      });
    });
    timers.current.push(
      window.setTimeout(() => {
        setTheme(target);
      }, 230),
      window.setTimeout(() => {
        setVeil((v) => (v === null ? null : { ...v, stage: "out" }));
      }, 280),
      window.setTimeout(() => {
        setVeil(null);
      }, 650),
    );
  };

  return (
    <>
      <button
        type="button"
        className="theme-toggle"
        aria-label={
          locale === "ar"
            ? dark
              ? "التبديل إلى الوضع الفاتح"
              : "التبديل إلى الوضع الداكن"
            : dark
              ? "Switch to light mode"
              : "Switch to dark mode"
        }
        aria-pressed={dark}
        title={dark ? "Light mode" : "Dark mode"}
        onClick={() => {
          switchTo(dark ? "light" : "dark");
        }}
      >
        <svg
          className="icon icon-sun"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5 5l1.7 1.7M17.3 17.3 19 19M19 5l-1.7 1.7M6.7 17.3 5 19" />
        </svg>
        <svg className="icon icon-moon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M20.6 14.4A8.7 8.7 0 0 1 9.6 3.4a1 1 0 0 0-1.3-1.2 10 10 0 1 0 13.5 13.5 1 1 0 0 0-1.2-1.3Z" />
        </svg>
      </button>
      {veil !== null && (
        <div
          className={`theme-veil${veil.stage === "in" ? " on" : veil.stage === "out" ? " off" : ""}`}
          style={{ background: CANVAS_COLOR[veil.target] }}
          aria-hidden="true"
        />
      )}
    </>
  );
}
