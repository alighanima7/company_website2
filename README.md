# NNS 3D Platform

> ## ⚠️ THIS README IS OUTDATED — except the final section
>
> Everything between here and **"Deployment and launch"** describes an
> architecture that **no longer exists**, and is pending a rewrite:
>
> - It claims **GSAP ScrollTrigger + Lenis**. Neither is a dependency any
>   more — check `package.json`. Pages scroll natively and the 3D scenes run
>   on a clock (see the note at the top of `src/motion.ts`).
> - It describes **one continuous ~7-viewport scroll film with phases
>   01–07** and `syncPhases()` in `src/scroll.ts`. That file is gone. The app
>   is now a **four-route hash-routed multi-page site** (`#/`, `#/products`,
>   `#/support`, `#/requests-about`) behind one persistent 3D stage, plus a
>   non-scrolling products **showroom** and per-product detail views.
> - The **colour system described below is not the one in use.** It lists
>   Brown-Gray `#1E1A17`, Bright Sage `#6B8E6F`, Bright Terracotta `#DD8D65`,
>   Soft Pastel Pink `#F3C3C8` and Vibrant Mint `#22E3A2`. The real palette is
>   teal `#19586A`, palm green `#198948`, paper `#F0F6F4` and teal-black
>   `#0B1619` — see the header comment in `src/styles.css`, which is accurate.
> - It documents no asset pipeline. Two scripts exist: `npm run models` and
>   `npm run posters`.
>
> **The "Deployment and launch" section at the bottom is current and
> maintained.** Trust that one.

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
Light is a **pastel-pink studio** built on a strict 3-color system:
Soft Pastel Pink `#F3C3C8` canvas/fog/atmosphere, crisp White `#FFFFFF`
cards and panels, Deep Charcoal `#2A2A2F` headings + body text + borders
+ UI framing, and Vibrant Mint `#22E3A2` reserved for non-text accents —
active phase ticks, the progress-rail fill, callout spines, CTA hover
borders and glows (mint sits at ~1.07:1 against the pink canvas, so it
never carries type; typography beside it is always charcoal). The
hardware goes matte/anodized charcoal (`#2A2A2F`/`#1E1E22`) with mint
LEDs and PCB traces, and the Kingdom renders as a charcoal slab with
mint circuit-edge line work — a dark product shot popping off the pink
backdrop. ACES tone mapping, a hot white key with real PCF shadows onto
an invisible charcoal-tinted catcher, a mint rim light and lifted IBL,
normal blending (additive light and low bloom thresholds are both
invisible-or-haze on a light canvas). DPR renders up to 2. The narrative
panels and HUD cards are glowing glassmorphism in BOTH themes: frosted
translucent fills (`backdrop-filter: blur(20px) saturate(160%)`, with the
`-webkit-` prefix and an `@supports` near-opaque fallback), rounded 24px
geometry, a masked 1px luminous refraction rim (mint in light, sage →
terracotta in dark), side edge flares inside the glass, and a gentle
rim-luminosity breathing/hover shift (opacity-only, stilled under
reduced motion). Anything passing beneath the glass — callouts included —
diffuses into soft glow, which is the intended smoked-glass read.

---

# Deployment and launch

**This section is current and maintained** (unlike the rest of this README).

Final host: **Cloudflare Pages** — static output, no server, no rewrites.
Because the app is a hash router, every real URL is `/`; deep links like
`#/products/fmc130` are fragments the server never sees, so nothing needs
SPA-rewrite rules. `vercel.json` exists only to mirror the same rules on a
Vercel preview for phone testing.

Build command: `npm run build` · Output directory: `dist`

## The four files that control deployment

| File | Read by | Controls |
| --- | --- | --- |
| `vite.config.ts` | the build | `PRELAUNCH_NOINDEX`, `SITE_ORIGIN` |
| `public/_headers` | **Cloudflare Pages** | all HTTP headers (primary) |
| `vercel.json` | Vercel preview only | the same headers, mirrored |
| `public/404.html` | the host | the real 404 page |

`public/_headers` and `public/404.html` are copied verbatim into `dist/` by
Vite's `publicDir` copy — no configuration needed.

**`_headers` and `vercel.json` must stay in sync by hand.** After editing
either, run:

```bash
npm run check:launch
```

It is read-only, exits non-zero on any disagreement, and checks the two
things that otherwise fail silently: a half-finished launch, and a stale CSP
hash.

## Caching

| Path | Policy | Why |
| --- | --- | --- |
| `/assets/*` | `max-age=31536000, immutable` | Vite content-hashes these — a change means a new filename, so there is no staleness risk |
| `/`, `/index.html`, `/404.html` | `max-age=0, must-revalidate` | the shell is the only file that knows the current asset hashes |
| `/fonts/*` | `max-age=2592000` + `ACAO: *` | unhashed but stable; ACAO keeps the `crossorigin` preloads clean |
| `/models/*`, `/posters/*`, `/images/*`, `/brand/*`, favicons, `og.jpg` | `max-age=86400, stale-while-revalidate=86400` | unhashed **and** expected to be replaced |

**The trade-off on that last row:** after replacing a model or poster, a
*returning* visitor can keep the old file for up to 24 h, and in the worst
case see it once more during the stale window before the background
revalidation lands — so **up to ~48 h**. First-time visitors always get the
new file. The alternative (`max-age=0`) costs a network round-trip for every
asset on every visit, including multi-megabyte GLBs.

**To make those paths `immutable` later** — the proper fix once the real
models land: give them content-hashed filenames. Have
`scripts/optimize-models.mjs` and `scripts/render-posters.mjs` emit
`fmc130.a1b2c3d4.glb` plus a generated `models.manifest.json`, and have
`CONFIGS` in `src/three/FmcDevice.tsx` and `posterSrc()` read the manifest
instead of hardcoding paths. Then these directories can go `immutable` with
no staleness at all. A `?v=2` query string is **not** a substitute — it does
not change the cache key on every CDN.

## CSP — currently Report-Only

The CSP ships as `Content-Security-Policy-Report-Only`, which reports
violations to the browser console **without blocking anything**. Verified
with zero violations across 68 cells (17 routes × light/dark × AR/EN) with
models, posters and WebGL all working.

Every non-obvious source is justified in a comment block in
`public/_headers`. The two that are load-bearing and non-obvious:

- **`img-src blob:`** — GLTFLoader turns the `EXT_texture_webp` textures
  inside the GLBs into blob URLs.
- **`connect-src blob:`** — those same textures are then *fetched* from
  those blob URLs, which counts as `connect-src`, not `img-src`. Omitting
  this produced **632 violations**; it was found only because the policy was
  Report-Only first.

Not needed: `https://www.gstatic.com`. That is drei's default Draco decoder
CDN and it is dead code here — every `useGLTF` call passes `useDraco: false`
and all seven GLBs use meshopt, not Draco. **If Draco is ever enabled, the
CSP must gain it in `script-src` and `connect-src`.**

### Editing the inline theme bootstrap invalidates the CSP

`index.html` contains an inline script (the zero-flash theme/locale
bootstrap). The CSP allows it by **SHA-256 hash**. Change even one byte of
that script and the hash no longer matches — under Report-Only that is a
console warning; once enforcing, it is a **blank page**.

`npm run check:launch` recomputes the hash and prints the correct
replacement value. Paste it into **both** `public/_headers` and
`vercel.json`.

### To switch CSP from Report-Only to enforcing

1. Deploy a Cloudflare Pages **preview** with the current Report-Only policy.
2. Visit every route in both themes and both locales with DevTools open:
   home, `#/products`, `?p=` for all six products, all six
   `#/products/<id>`, `#/support`, `#/requests-about`, and a bad hash.
3. Confirm **zero** CSP messages in the console, and that models render
   textured (not plain grey), posters appear, and the theme toggle works.
4. Only then rename the header `Content-Security-Policy-Report-Only` to
   `Content-Security-Policy` in **both** files, and re-verify on a preview
   before promoting to production.
5. If `worker-src blob:` never reported anything, it can be dropped at the
   same time — it is defensive cover for drei's unused DRACOLoader.

## Changing the site origin

One line, `SITE_ORIGIN` in `vite.config.ts`. It is substituted into
`__SITE_ORIGIN__` in `index.html` at build **and** dev time, feeding
`<link rel="canonical">`, `og:url`, `og:image` and `twitter:image`. Never
hand-edit those tags. No trailing slash (`check:launch` enforces this).

## Launch checklist — removing the search block

The site is currently **blocked from search engines by three mechanisms**.
Removing them is **three edits plus a verification**:

1. **`vite.config.ts`** — set `const PRELAUNCH_NOINDEX = false;`
   (this alone handles `<meta name="robots">` and `robots.txt`)
2. **`public/_headers`** — delete the whole block fenced by
   `PRELAUNCH NOINDEX … END PRELAUNCH NOINDEX BLOCK`
3. **`vercel.json`** — delete the **first** entry in the `headers` array
   (the one whose only header is `X-Robots-Tag`)
4. **Verify:**
   ```bash
   npm run check:launch   # must print PASS and "Current state: LAUNCHED"
   npm run build
   ```
5. After deploying, confirm on the live URL:
   ```bash
   curl -sI https://<domain>/ | grep -i x-robots-tag   # expect NO output
   curl -s  https://<domain>/robots.txt                # expect "Allow: /"
   ```

`public/404.html` keeps its `noindex` meta permanently — a 404 should never
be indexed. `check:launch` deliberately ignores that file.

Also worth doing at launch: add a `sitemap.xml` and a `Sitemap:` line to the
generated `robots.txt` in `vite.config.ts`. Note that hash routing limits
what indexing can achieve at all — crawlers only ever fetch `/`, so the
individual routes are not separately indexable. Moving to History-API
routing is the only real fix, and it would require SPA-rewrite rules.

## Cloudflare dashboard settings to check

Several Cloudflare features rewrite HTML or inject scripts, which **breaks
the hash-based CSP and can break the app**. Verify these for the Pages
project / zone:

| Setting | Required | Why |
| --- | --- | --- |
| **Speed → Optimization → Rocket Loader** | **OFF** | injects an inline script the hash CSP will reject, and reorders script execution, which can break React's boot |
| **Auto Minify / any HTML modification** | **OFF** | rewriting `index.html` changes the inline bootstrap's bytes and **invalidates the CSP hash** |
| **Scrape Shield → Email Obfuscation** | **OFF** | rewrites `mailto:` links and injects `/cdn-cgi/scripts/.../email-decode.min.js` — breaks the CSP *and* the contact/quote flow, which depends on `mailto:` as its only transport |
| **Web Analytics** | optional | if enabled, the CSP must gain `script-src https://static.cloudflareinsights.com` and `connect-src https://cloudflareinsights.com` in **both** config files |

## Testing headers locally

The deployed headers come from `public/_headers`, which `vite preview` does
**not** apply. To exercise them for real, use Cloudflare's own tooling:

```bash
npm i -D wrangler
npm run build
npx wrangler pages dev dist --port 8788
```

That is the only local setup that uses Cloudflare's actual `_headers`
parser. `wrangler` is **not** currently a dependency — install it only if
you want this.

Either way, a Cloudflare Pages **preview deployment** is the authoritative
check. Verify with:

```bash
curl -sI https://<preview>/                        # noindex, no-cache, CSP, security headers
curl -sI https://<preview>/assets/index-<hash>.js  # immutable, 1 year
curl -sI https://<preview>/models/fmc130.glb       # 1 day + stale-while-revalidate
curl -sI https://<preview>/fonts/ibm-plex-sans-arabic-arabic-400-normal.woff2
curl -sI https://<preview>/no-such-path            # expect HTTP 404 + the branded page
```
