import { useEffect, useRef } from "react";
import type { JSX } from "react";

import { BRAND, CONTACT, COPY, DOMAINS, HOME_MAP, STATS } from "../content";
import { attachHomeScroll } from "../homeScroll";
import { useLocale } from "../locale";
import { phase } from "../motion";
import { hrefFor } from "../router";
import { Counter } from "../ui/Counter";
import { initReveals } from "../ui/reveal";

/**
 * Home — the Z-axis depth film. The DOM is the scroll runway: the hero
 * section (logo foreground act) and the map section (map stage act) size
 * the track that homeScroll measures; the canvas behind plays the depth
 * passage off that progress. This page alone attaches the scroll
 * listener — unmounting detaches it and resets the state, so the other
 * routes stay plain documents.
 */
export function HomePage(): JSX.Element {
  const l = useLocale();
  const root = useRef<HTMLDivElement | null>(null);
  const mapSection = useRef<HTMLElement | null>(null);
  const heroPanel = useRef<HTMLDivElement | null>(null);
  const cueRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = root.current;
    const reveals = el === null ? undefined : initReveals(el);
    const end = mapSection.current;
    let detach: (() => void) | undefined;
    if (end !== null) {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      detach = attachHomeScroll(end, (t) => {
        // DOM side of the passage, written directly on the passive
        // listener (no React churn): the hero glass yields before the
        // logo's Z-flight begins, and the cue dies on first movement.
        // Reduced motion keeps both fully opaque and readable.
        if (reduced) return;
        const panel = heroPanel.current;
        if (panel !== null) {
          const o = 1 - phase(t, 0.26, 0.46);
          panel.style.opacity = String(o);
          panel.style.pointerEvents = o < 0.4 ? "none" : "";
        }
        const cue = cueRef.current;
        if (cue !== null) cue.style.opacity = String(Math.max(0, 1 - t * 7));
      });
    }
    return () => {
      reveals?.();
      detach?.();
    };
  }, []);

  return (
    <div className="page page-home" ref={root}>
      {/* ── Act 0: glass copy beside the foreground logo ───────────────── */}
      <section className="home-hero">
        <div className="hero-block" ref={heroPanel}>
          <p className="eyebrow reveal">
            <span className="eyebrow-dot" />
            {BRAND.licenses[0][l]}
          </p>
          <h1 className="reveal">
            <span>{BRAND.taglineA[l]}</span>
            <span className="accent">{BRAND.taglineB[l]}</span>
          </h1>
          <p className="sub reveal">{BRAND.sub[l]}</p>
          <div className="cta-row reveal">
            <a className="btn primary" href={hrefFor("products")}>
              {l === "ar" ? "استكشف المنتجات" : "Explore products"}
            </a>
            <a className="btn" href={hrefFor("requests")}>
              {l === "ar" ? "اطلب عرض سعر" : "Request a quote"}
            </a>
          </div>
        </div>

        {/* Scroll invitation — parked at the first viewport's foot. */}
        <div className="scroll-cue" ref={cueRef} aria-hidden="true">
          <span>{COPY.cue[l]}</span>
          <span className="mono">SCROLL</span>
          <span className="cue-line" />
        </div>
      </section>

      {/* ── Act 2: Kingdom network + figures (the film's landing) ──────── */}
      <section className="home-map" ref={mapSection}>
        <div className="copy-block">
          <p className="kicker mono reveal">{HOME_MAP.kicker}</p>
          <h2 className="reveal">{HOME_MAP.h2[l]}</h2>
          <p className="lead reveal">{HOME_MAP.lead[l]}</p>
          <div className="stats reveal">
            {STATS.map((stat) => (
              <Counter key={stat.tag} value={stat.value} suffix={stat.suffix} en={stat.tag} ar={stat.label[l]} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Solution domains + contact ─────────────────────────────────── */}
      <section className="home-tail">
        <p className="kicker mono reveal">07 // SOLUTIONS</p>
        <h2 className="reveal">{l === "ar" ? "ثلاثون حلًا في أربعة مجالات" : "Thirty solutions across four domains"}</h2>

        <div className="domains reveal">
          {DOMAINS.map((domain) => (
            <article className="domain" key={domain.tag}>
              {/* Real <img> (not CSS background) so the browser can defer
                  the fetch until this block approaches the viewport. */}
              <img className="domain-photo" src={domain.image} alt="" loading="lazy" decoding="async" />
              <span className="domain-scrim" />
              <span className="domain-count mono" dir="ltr">
                {String(domain.count).padStart(2, "0")}
              </span>
              <span className="domain-name">{domain.name[l]}</span>
              <span className="domain-en mono">{domain.tag}</span>
              <ul className="domain-list">
                {domain.solutions.map((solution) => (
                  <li key={solution.en}>{solution[l]}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <div className="contact reveal">
          <a href={`tel:${CONTACT.phone}`} className="contact-item">
            <span className="mono" dir="ltr">
              {CONTACT.phone}
            </span>
            <span>{CONTACT.labels.call[l]}</span>
          </a>
          <a href={`mailto:${CONTACT.email}`} className="contact-item">
            <span className="mono" dir="ltr">
              {CONTACT.email}
            </span>
            <span>{CONTACT.labels.mail[l]}</span>
          </a>
          <a href={`https://${CONTACT.site}`} target="_blank" rel="noopener noreferrer" className="contact-item">
            <span className="mono" dir="ltr">
              {CONTACT.site}
            </span>
            <span>{CONTACT.labels.group[l]}</span>
          </a>
        </div>
      </section>
    </div>
  );
}
