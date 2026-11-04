import gsap from "gsap";
import { useEffect, useRef } from "react";
import type { JSX } from "react";

import { BRAND, COPY, PHASE_LABELS, PHASES } from "../content";
import { getLocale, useLocale } from "../locale";
import { scrollState } from "../scroll";

/**
 * Fixed command-center chrome: brand mark, live phase indicator, progress
 * rail with phase ticks, and the corner frame. Updated by direct DOM writes
 * on the GSAP ticker — the HUD never re-renders React during scroll. The
 * ticker reads the live locale for the phase name; a locale switch resets
 * the index latch so the readout rewrites immediately.
 */

// Reads the LIVE phase object — boundaries move when syncPhases() re-measures.
function phaseIndex(p: number): number {
  if (p < PHASES.heroEnd) return 0;
  if (p < PHASES.teardownEnd) return 1;
  if (p < PHASES.collarEnd) return 2;
  if (p < PHASES.networkEnd) return 3;
  if (p < PHASES.aiEnd) return 4;
  return 5;
}

export function Hud(): JSX.Element {
  const locale = useLocale();
  const fillRef = useRef<HTMLDivElement | null>(null);
  const codeRef = useRef<HTMLSpanElement | null>(null);
  const nameRef = useRef<HTMLSpanElement | null>(null);
  const ticksRef = useRef<Array<HTMLSpanElement | null>>([]);
  const cueRef = useRef<HTMLDivElement | null>(null);
  const lastIndex = useRef(-1);

  useEffect(() => {
    // Force the next tick to rewrite the readout in the new language.
    lastIndex.current = -1;
  }, [locale]);

  useEffect(() => {
    const update = (): void => {
      const p = scrollState.current;
      if (fillRef.current !== null) fillRef.current.style.transform = `scaleY(${String(Math.max(0.002, p))})`;
      if (cueRef.current !== null) cueRef.current.style.opacity = String(Math.max(0, 1 - p * 14));

      const index = phaseIndex(p);
      if (index !== lastIndex.current) {
        lastIndex.current = index;
        const label = PHASE_LABELS[index];
        if (label !== undefined && codeRef.current !== null && nameRef.current !== null) {
          codeRef.current.textContent = label.code;
          nameRef.current.textContent = label.name[getLocale()];
        }
        ticksRef.current.forEach((tick, i) => {
          if (tick !== null) tick.classList.toggle("active", i <= index);
        });
      }
    };
    gsap.ticker.add(update);
    return () => {
      gsap.ticker.remove(update);
    };
  }, []);

  return (
    <div className="hud" aria-hidden="true">
      {/* Corner frame */}
      <span className="frame-corner tl" />
      <span className="frame-corner tr" />
      <span className="frame-corner bl" />
      <span className="frame-corner br" />

      {/* Brand mark (bilingual lockup by design) */}
      <div className="hud-brand">
        <span className="hud-shield">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3l8 3v6c0 4.6-3.2 7.9-8 9-4.8-1.1-8-4.4-8-9V6z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
        </span>
        <span className="hud-brand-name">{BRAND.nameAr}</span>
        <span className="hud-brand-en mono">{BRAND.nameEn}</span>
      </div>

      {/* Phase readout */}
      <div className="hud-phase">
        <span className="mono" ref={codeRef}>
          01 // DEVICE
        </span>
        <span ref={nameRef}>{PHASE_LABELS[0]?.name[locale]}</span>
      </div>

      {/* Progress rail */}
      <div className="hud-rail">
        <div className="hud-rail-track">
          <div className="hud-rail-fill" ref={fillRef} />
        </div>
        {PHASE_LABELS.map((label, i) => (
          <span
            key={label.code}
            className={`hud-tick${i === 0 ? " active" : ""}`}
            ref={(el) => {
              ticksRef.current[i] = el;
            }}
          />
        ))}
      </div>

      {/* Scroll cue (hero only) */}
      <div className="hud-cue" ref={cueRef}>
        <span>{COPY.cue[locale]}</span>
        <span className="mono">SCROLL</span>
        <span className="cue-line" />
      </div>

      <div className="hud-exp mono">EXPERIMENTAL BUILD · V2</div>
    </div>
  );
}
