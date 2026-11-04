import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useEffect } from "react";
import type { JSX } from "react";

import { AI_EVENTS, BRAND, COLLAR_SENSORS, CONTACT, COPY, DOMAINS, STATS } from "../content";
import { useLocale } from "../locale";
import { Counter } from "./Counter";

gsap.registerPlugin(ScrollTrigger);

/**
 * The narrative DOM riding over the canvas. Each phase is a tall section with
 * a sticky inner block, so copy HOLDS while its 3D beat plays and then yields
 * to the next. Reveals are scrubbed (reversible) rather than time-based —
 * scrolling back rewinds the story exactly.
 *
 * Bilingual: every string resolves through the locale store. A locale switch
 * re-renders text in place (the reveal tweens hold the same DOM nodes, so
 * nothing re-animates) and the store fires a resize so phases re-sync to the
 * new text metrics.
 */

export function Sections(): JSX.Element {
  const l = useLocale();

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const tweens = gsap.utils.toArray<HTMLElement>(".reveal").map((el) => {
      // clamp() ONLY near the document's end, where unclamped reveals freeze
      // at partial opacity. Clamping everything breaks the opposite edge:
      // hero elements already in view at scroll 0 collapse to a zero-length
      // trigger and never reveal at all.
      const clampIt = el.closest(".section-outro") !== null;
      const edge = (v: string): string => (clampIt ? `clamp(${v})` : v);
      return gsap.fromTo(
        el,
        { autoAlpha: 0, y: 44 },
        {
          autoAlpha: 1,
          y: 0,
          ease: "none",
          scrollTrigger: { trigger: el, start: edge("top 86%"), end: edge("top 58%"), scrub: true },
        },
      );
    });
    return () => {
      tweens.forEach((tween) => {
        tween.scrollTrigger?.kill();
        tween.kill();
      });
    };
  }, []);

  return (
    <main className="sections">
      {/* ── 01 · HERO ─────────────────────────────────────────────────── */}
      <section className="section section-hero">
        <div className="sticky-inner">
          <div className="hero-block">
            <p className="eyebrow reveal">
              <span className="eyebrow-dot" />
              {BRAND.licenses[0][l]}
            </p>
            <h1 className="reveal">
              <span>{BRAND.taglineA[l]}</span>
              <span className="accent">{BRAND.taglineB[l]}</span>
            </h1>
            <p className="sub reveal">{BRAND.sub[l]}</p>
          </div>
        </div>
      </section>

      {/* ── 02 · TEARDOWN ─────────────────────────────────────────────── */}
      <section className="section section-teardown">
        <div className="sticky-inner">
          <div className="copy-block end">
            <p className="kicker mono reveal">{COPY.teardown.kicker}</p>
            <h2 className="reveal">
              {COPY.teardown.h2a[l]}
              <br />
              {COPY.teardown.h2b[l]}
            </h2>
            <p className="lead reveal">{COPY.teardown.lead[l]}</p>
          </div>
        </div>
      </section>

      {/* ── 03 · SMART COLLAR (field tracking unit) ───────────────────── */}
      <section className="section section-collar">
        <div className="sticky-inner">
          <div className="copy-block">
            <p className="kicker mono reveal">{COPY.collar.kicker}</p>
            <h2 className="reveal">
              {COPY.collar.h2a[l]}
              <br />
              {COPY.collar.h2b[l]}
            </h2>
            <p className="lead reveal">{COPY.collar.lead[l]}</p>
            <div className="chips reveal" style={{ marginTop: 18 }}>
              {COLLAR_SENSORS.map((sensor) => (
                <span className="chip" key={sensor.en}>
                  {sensor[l]}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── 04 · NETWORK ──────────────────────────────────────────────── */}
      <section className="section section-network">
        <div className="sticky-inner">
          <div className="copy-block center">
            <p className="kicker mono reveal">{COPY.network.kicker}</p>
            <h2 className="reveal">{COPY.network.h2[l]}</h2>
            <p className="lead reveal">{COPY.network.lead[l]}</p>
            <div className="stats reveal">
              {STATS.map((stat) => (
                <Counter key={stat.tag} value={stat.value} suffix={stat.suffix} en={stat.tag} ar={stat.label[l]} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── 04 · AI VISION ────────────────────────────────────────────── */}
      <section className="section section-ai">
        <div className="sticky-inner">
          <div className="copy-block end">
            <p className="kicker mono reveal">{COPY.ai.kicker}</p>
            <h2 className="reveal">
              {COPY.ai.h2a[l]}
              <br />
              {COPY.ai.h2b[l]}
            </h2>
            <div className="ai-groups reveal">
              {[AI_EVENTS.dms, AI_EVENTS.adas].map((groupItem) => (
                <div className="ai-group" key={groupItem.tag}>
                  <p className="ai-title">
                    {groupItem.title[l]} <span className="mono">{groupItem.tag}</span>
                  </p>
                  <div className="chips">
                    {groupItem.items.map((item) => (
                      <span className="chip" key={item.en}>
                        {item[l]}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── 05 · SOLUTIONS + CONTACT ──────────────────────────────────── */}
      <section className="section section-outro">
        <div className="outro-inner">
          <p className="kicker mono reveal">{COPY.outro.kicker}</p>
          <h2 className="reveal">{COPY.outro.h2[l]}</h2>

          <div className="domains reveal">
            {DOMAINS.map((domain) => (
              <article className="domain" key={domain.tag} style={{ backgroundImage: `url(${domain.image})` }}>
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

          <p className="licenses reveal">
            {BRAND.licenses[0][l]} · {BRAND.licenses[1][l]}
          </p>

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

          <footer className="footer">
            <span>
              {l === "ar" ? BRAND.nameAr : BRAND.nameEn} — {CONTACT.address[l]}
            </span>
            <span className="mono">NNS V2 · EXPERIMENTAL 3D BUILD · NOT PRODUCTION</span>
          </footer>
        </div>
      </section>
    </main>
  );
}
