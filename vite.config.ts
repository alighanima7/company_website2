import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import type { Plugin } from "vite";

/* ══════════════════════════════════════════════════════════════════════════
   DEPLOYMENT SWITCHES — see the "Deployment and launch" section in README.md
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * PRE-LAUNCH SEARCH BLOCK.
 *
 * While true, the build stamps `<meta name="robots" content="noindex,
 * nofollow">` into index.html and emits a `robots.txt` that disallows
 * everything. Flip to false at launch.
 *
 * This flag only drives the two HOST-INDEPENDENT pieces, because they are
 * produced by this build. The matching `X-Robots-Tag` HTTP header lives in
 * two static config files the build never reads — `public/_headers`
 * (Cloudflare Pages, the real host) and `vercel.json` (the phone-test
 * preview) — so launching means editing those too.
 *
 * `npm run check:launch` verifies all four agree and fails if they do not.
 */
const PRELAUNCH_NOINDEX = true;

/**
 * Canonical public origin, no trailing slash. ONE place: substituted into
 * `__SITE_ORIGIN__` in index.html (canonical, og:url, og:image,
 * twitter:image) at build AND dev time. Change this single line when the
 * custom domain goes live.
 */
const SITE_ORIGIN = "https://companywebsite2-sage.vercel.app";

/** Build-time metadata: origin substitution + the pre-launch robots block. */
function deploymentMeta(): Plugin {
  return {
    name: "nns-deployment-meta",
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        return {
          html: html.replaceAll("__SITE_ORIGIN__", SITE_ORIGIN),
          tags: PRELAUNCH_NOINDEX
            ? [
                {
                  tag: "meta",
                  attrs: { name: "robots", content: "noindex, nofollow" },
                  injectTo: "head-prepend" as const,
                },
              ]
            : [],
        };
      },
    },
    /* robots.txt is GENERATED from the flag above rather than kept in
       public/, so the crawl policy has exactly one source of truth.
       (Consequence: /robots.txt is absent under `npm run dev` — it is a
       build artifact. Documented in README.) */
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "robots.txt",
        source: PRELAUNCH_NOINDEX
          ? "# Pre-launch: the site is not ready to be indexed.\n# Flip PRELAUNCH_NOINDEX in vite.config.ts at launch.\nUser-agent: *\nDisallow: /\n"
          : "User-agent: *\nAllow: /\n",
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), deploymentMeta()],
  build: {
    target: "es2022",
    // three + postprocessing are legitimately large; split them so the app
    // shell streams first and the heavy vendor chunk caches independently.
    rollupOptions: {
      output: {
        manualChunks: {
          three: ["three", "@react-three/fiber", "@react-three/drei"],
          // ONLY the vanilla postprocessing lib here (it depends on three
          // alone). Its react wrapper must stay in the index chunk: pinning
          // it here makes fx↔index circular (wrapper needs react, index
          // needs the wrapper) and the init order breaks with a TDZ
          // ReferenceError on load.
          fx: ["postprocessing"],
        },
      },
    },
    // three + GLTFLoader/meshopt (the tracker GLB's local decode stack).
    chunkSizeWarningLimit: 1280,
  },
});
