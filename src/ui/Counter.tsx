import { useEffect, useRef } from "react";
import type { JSX } from "react";

/** Telemetry figure: counts up once when scrolled into view. */

function format(value: number): string {
  if (value >= 1_000_000) return `${String(Math.round(value / 100_000) / 10).replace(/\.0$/, "")}M`;
  return value.toLocaleString("en-US");
}

export function Counter({
  value,
  suffix,
  en,
  ar,
}: {
  value: number;
  suffix: string;
  en: string;
  ar: string;
}): JSX.Element {
  const numberRef = useRef<HTMLSpanElement | null>(null);
  const played = useRef(false);

  useEffect(() => {
    const el = numberRef.current;
    if (el === null) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting) || played.current) return;
        played.current = true;
        io.disconnect();
        const t0 = performance.now();
        const tick = (now: number): void => {
          const t = Math.min(1, (now - t0) / 1400);
          const eased = 1 - Math.pow(1 - t, 3);
          el.textContent = format(Math.round(value * eased)) + suffix;
          if (t < 1) requestAnimationFrame(tick);
        };
        el.textContent = `0${suffix}`;
        requestAnimationFrame(tick);
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
    };
  }, [value, suffix]);

  return (
    <div className="stat">
      <span className="stat-value mono" dir="ltr" ref={numberRef}>
        {format(value)}
        {suffix}
      </span>
      <span className="stat-ar">{ar}</span>
      <span className="stat-en mono">{en}</span>
    </div>
  );
}
