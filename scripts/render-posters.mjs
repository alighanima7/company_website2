/**
 * Poster baker — `npm run posters`.
 *
 * Renders every VISIBLE product, in BOTH themes, through the app's own
 * `?poster=<id>&theme=…` capture mode (see src/poster/boot.ts), so the
 * posters carry the exact production lighting, camera pose and materials.
 * Output: public/posters/<id>-light.webp and <id>-dark.webp, transparent,
 * ~1200×900.
 *
 * Pipeline: `vite preview` (the PRODUCTION build — run `npm run build`
 * first; this script errors if dist/ is stale-missing) → system Chrome
 * headless via puppeteer-core (no bundled browser; set CHROME_PATH to
 * override discovery) → canvas screenshot with alpha → sharp → webp.
 *
 * Re-runnable by design: after swapping GLBs run `npm run models`, then
 * `npm run build`, then `npm run posters`.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import puppeteer from "puppeteer-core";
import sharp from "sharp";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const OUT_DIR = join(ROOT, "public", "posters");
const PORT = 4323; // not the dev/preview defaults — never collides
const BASE = `http://localhost:${PORT}`;
const WIDTH = 1200;
const HEIGHT = 900;
/** Capture at 2× then downscale — crisper edges in the webp. */
const SCALE = 2;

function findChrome() {
  const envPath = process.env.CHROME_PATH;
  if (envPath !== undefined && envPath !== "" && existsSync(envPath)) return envPath;
  const candidates =
    process.platform === "win32"
      ? [
          "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
          "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
          `${process.env.LOCALAPPDATA ?? ""}\\Google\\Chrome\\Application\\chrome.exe`,
          "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
        ]
      : process.platform === "darwin"
        ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
        : ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
  const hit = candidates.find((c) => c !== "" && existsSync(c));
  if (hit === undefined) {
    throw new Error(
      "No Chrome/Edge found. Set CHROME_PATH to your browser executable and re-run.",
    );
  }
  return hit;
}

function startPreview() {
  if (!existsSync(join(ROOT, "dist", "index.html"))) {
    throw new Error("dist/ missing — run `npm run build` before `npm run posters`.");
  }
  const viteBin = join(ROOT, "node_modules", "vite", "bin", "vite.js");
  const child = spawn(
    process.execPath,
    [viteBin, "preview", "--port", String(PORT), "--strictPort"],
    { cwd: ROOT, stdio: "pipe" },
  );
  child.stderr.on("data", (d) => process.stderr.write(String(d)));
  return child;
}

async function waitForServer(timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(BASE + "/");
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("vite preview did not come up on " + BASE);
}

async function capture(page, id, theme) {
  const url = `${BASE}/?poster=${id}&theme=${theme}`;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction("window.__posterReady !== undefined", { timeout: 60000 });
  const ok = await page.evaluate("window.__posterReady === true");
  if (!ok) throw new Error(`poster boot failed for ${id} (${theme}) — see page console`);

  const canvas = await page.$(".stage canvas");
  if (canvas === null) throw new Error(`no canvas for ${id} (${theme})`);
  const png = await canvas.screenshot({ omitBackground: true, type: "png" });

  // Trim the transparent surround, then fit onto a consistent WIDTH×HEIGHT
  // transparent board — every poster shares margins whatever its silhouette.
  const trimmed = await sharp(png).trim({ threshold: 8 }).toBuffer();
  const out = await sharp(trimmed)
    .resize(WIDTH - 120, HEIGHT - 120, { fit: "inside", withoutEnlargement: false })
    .extend({
      top: 60,
      bottom: 60,
      left: 60,
      right: 60,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .resize(WIDTH, HEIGHT, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .webp({ quality: 84, alphaQuality: 90 })
    .toBuffer();

  const file = join(OUT_DIR, `${id}-${theme}.webp`);
  await writeFile(file, out);
  return out.byteLength;
}

const preview = startPreview();
let browser;
try {
  await waitForServer();
  browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: true,
    args: [
      "--headless=new",
      "--disable-gpu-sandbox",
      "--no-first-run",
      // WebGL in headless needs the real GPU process on most machines.
      "--enable-unsafe-swiftshader",
      "--use-angle=default",
    ],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 960, deviceScaleFactor: SCALE });
  page.on("console", (m) => {
    if (m.type() === "error") console.error("  [page]", m.text());
  });

  // The app publishes the visible lineup — the hidden flag stays the one
  // source of truth; this script never hardcodes ids.
  await page.goto(`${BASE}/?poster=__list&theme=light`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction("Array.isArray(window.__posterIds)", { timeout: 30000 });
  const ids = await page.evaluate("window.__posterIds");

  await mkdir(OUT_DIR, { recursive: true });
  console.log(`Baking ${ids.length} products × 2 themes → public/posters/`);
  let total = 0;
  for (const id of ids) {
    for (const theme of ["light", "dark"]) {
      const bytes = await capture(page, id, theme);
      total += bytes;
      console.log(`  ${`${id}-${theme}.webp`.padEnd(28)} ${(bytes / 1024).toFixed(1).padStart(7)} kB`);
    }
  }
  console.log(`Total poster payload: ${(total / 1024).toFixed(1)} kB (both themes, all products)`);
} finally {
  await browser?.close();
  preview.kill();
  // Windows: the detached listener can survive kill() — force-exit after
  // a grace period so no stray preview squats on the port between runs.
  setTimeout(() => process.exit(0), 800).unref();
}
