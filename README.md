# NNS 3D Platform

The NNS landing page as a cinematic, scroll-driven 3D experience
(React Three Fiber + GSAP ScrollTrigger + Lenis). A fully standalone
Vite project — no monorepo, no workspace, no external references;
everything it needs lives in this folder.

Migrated 2026-11 from the `new_ver/` experimental build inside the
`web_site_campany` workspace (which remains untouched as the original).

**Content provenance:** all copy, figures, hardware specs and AI lists are
transcribed from the company profile «النخلة الاهلية الامنية v1.1.pdf»
(34 pages, in `info/`; see `src/content.ts` for per-block provenance
notes); the photos in `public/images/` are the brand's own.

## Bilingual (AR ⇄ EN)

Fully bilingual with Arabic (RTL) as the first-visit default. The AR/EN
glass chip under the theme toggle flips every string — sections, HUD
phase names, 3D callouts, city labels, stats, contact — and mirrors the
whole layout via `<html lang dir>` (the stylesheet is written in logical
properties, so RTL⇄LTR is automatic). The locale store (`src/locale.ts`)
mirrors the theme contract: localStorage `nns.locale.v2` + cookie
`nns-v2-locale`, pre-paint bootstrap in `index.html`, and a synthetic
resize after switching so the scroll system re-derives phase boundaries
for the new text metrics and restores the exact scroll position. English
headlines run a smaller type ramp (`html[lang="en"] h1/h2`) because Latin
copy is much longer than the dense Arabic taglines. Mono/uppercase
instrument text (phase codes, spec microlines, city codes) stays English
in both locales by design. English solution and IVMS event names are the
profile's own English pages, not translations.

## Run

```bash
cd C:\Users\alighanima\Desktop\web_site_campany2
npm install
npm run dev        # http://localhost:4321
npm run build      # typecheck + production build to dist/
npm run preview    # serve the production build on :4322
```

## The experience

One continuous scroll (~7 viewport-heights) drives a choreographed scene:

| Phase | What happens |
| --- | --- |
| 01 · الجهاز | Procedural NNS tracker assembles mid-air; headline + scroll cue |
| 02 · العتاد | The device **explodes into its real components** (GPS, CANbus/FMS, sensors, antenna, PCB) with floating HUD callouts |
| 03 · الطوق الذكي | The **smart security collar** (the Wild Animal Tracking field unit, modeled on the profile's own product photo) rises as the device parks itself as the hub: riveted leather band with stitching, steel buckle, armor plates and the navy tracking module — scroll-scrubbed turn, teardown with bilingual callouts, sensor chips |
| 04 · المدينة الذكية | A **smart-city micro-district** on a circular platform: tower cluster with lit windows (smart building), parking lot with live occupancy dots, lamp-lined street arc (smart lighting), bins + meter + inspection chamber (waste & metering) — all wired to a central IoT hub by dashed data pulses under a turning management ring, with sequenced bilingual callouts as the camera orbits |
| 05 · الشبكة | A **topographic 3D Kingdom** rises — low-poly Sarawat range along the Red Sea (peaking toward Abha), Tabuk highlands, the Najd plateau under Riyadh, coastal plains at Jeddah/Dammam — cities ignite at their real elevations and link to the Riyadh hub; live company figures count up |
| 06 · الذكاء | A security scan sweeps the Kingdom while DMS/ADAS detection events stream in |
| 07 · الحلول | The scene recedes; solution domains, licences and contact band |

Phase boundaries are **derived at runtime** from the actual section offsets
(`syncPhases()` in `src/scroll.ts`) and re-derived on resize/font-load with
the scroll position explicitly restored — so the camera cuts, the scene
beats and the pinned copy stay locked together at any viewport height
(including mobile URL-bar collapse, which is otherwise a classic
ScrollTrigger scroll-jump trap).

Performance posture: DPR clamped, bloom/vignette only on fine-pointer
devices, every animation honors `prefers-reduced-motion` (the scene then
renders assembled and static while content stays fully readable).

## Theme

Dual theme, **light by default** (same contract as production): light is
the CSS base on `:root`, dark is an explicit `data-theme="dark"` override,
and there is deliberately no `prefers-color-scheme` probe — only an
explicit choice persists. The sun/moon toggle writes localStorage
(`nns.theme.v2`) plus a cookie mirror (`nns-v2-theme`, v2-scoped so it
never collides with the production app on localhost), and an inline
bootstrap in `index.html` stamps the attribute pre-paint, so reloads are
flash-free. Switching plays a short veil cross-fade in the target canvas
color, masking the (inherently single-frame) WebGL palette swap.

The 3D scene follows via `SCENE` palettes in `src/theme.ts`. Dark is a
**warm luxury night** on its own strict 5-color system — Brown-Gray
`#1E1A17` canvas/fog, Dark Beige `#2A2420` cards and slab, Bright Sage
`#6B8E6F` headings/rim light/city beacons/scan, Ivory `#EAE5E0` body
text and key light, Bright Terracotta `#DD8D65` CTAs, the Riyadh hub,
network arcs and city pulses — still a glow instrument (additive
blending + bloom) but warm instead of neon.
Light is a **warm earthy daylight** built on a strict 5-color system:
Warm Beige `#F4EBE1` canvas/fog/atmosphere (no glare fields), Base White
`#FFFFFF` cards and panels, Sage Green `#2F5233` headings + brand
accents + line work, Dark Brown `#3E332E` body text and shadows, Warm
Terracotta `#C87A53` CTAs, links, the Riyadh hub beacon and network
arcs. The Kingdom renders as a forest-sage slab; the device hardware
keeps its navy alloy + emerald LEDs (product identity — reads like a
product shot on kraft paper). ACES tone mapping, a warm key light with
real PCF shadows onto an invisible brown-tinted catcher, warm hemisphere
fill, normal blending (additive light and low bloom thresholds are both
invisible-or-haze on a light canvas). DPR renders up to 2. DOM panels
frost (`backdrop-filter`) in light only; dark keeps frost off so its
translucent gradients don't smear the 3D callouts passing beneath.
