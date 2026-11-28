/**
 * `npm run check:launch` — READ-ONLY consistency check for the deployment
 * configuration. Writes nothing; exits 1 if anything disagrees.
 *
 * The pre-launch search block and the CSP are spread across four files that
 * cannot read each other:
 *
 *   vite.config.ts     PRELAUNCH_NOINDEX -> <meta robots> + robots.txt
 *   public/_headers    Cloudflare Pages (the real host): X-Robots-Tag + CSP
 *   vercel.json        the Vercel phone-test preview: same rules
 *   index.html         the inline theme bootstrap the CSP hash covers
 *
 * This script is the safety net. It catches the two failures that are
 * otherwise silent:
 *
 *   1. a HALF-FINISHED LAUNCH — the flag flipped but an X-Robots-Tag left
 *      behind (or the reverse), which either keeps the live site out of
 *      Google or exposes an unfinished one;
 *   2. a BROKEN CSP HASH — someone edits the inline bootstrap in
 *      index.html, which changes its SHA-256 and silently invalidates
 *      script-src. Under Report-Only that is a console warning; once the
 *      CSP is enforcing it is a blank page.
 *
 * public/404.html is deliberately NOT checked: a 404 is never indexable, so
 * its noindex meta is permanent and independent of the launch flag.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

const problems = [];
const notes = [];

function fail(msg) {
  problems.push(msg);
  console.log(`  FAIL  ${msg}`);
}
function ok(msg) {
  console.log(`  ok    ${msg}`);
}
function note(msg) {
  notes.push(msg);
  console.log(`  --    ${msg}`);
}
function read(path) {
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

/** Parse Cloudflare Pages `_headers`: "/path" lines, indented "Name: value". */
function parseHeadersFile(text) {
  const out = new Map();
  let current = null;
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    if (!/^\s/.test(line) && line.startsWith("/")) {
      current = line.trim();
      if (!out.has(current)) out.set(current, new Map());
      continue;
    }
    const m = /^\s+([A-Za-z0-9-]+):\s*(.*)$/.exec(line);
    if (m !== null && current !== null) out.get(current).set(m[1].toLowerCase(), m[2].trim());
  }
  return out;
}

/** Parse vercel.json's headers array into the same shape. */
function parseVercel(json) {
  const out = new Map();
  for (const entry of json.headers ?? []) {
    const src = entry.source;
    if (!out.has(src)) out.set(src, new Map());
    for (const h of entry.headers ?? []) out.get(src).set(h.key.toLowerCase(), h.value.trim());
  }
  return out;
}

/** `/assets/(.*)` and `/assets/*` describe the same paths. */
function normalizePath(p) {
  return p.replace(/\(\.\*\)$/, "*");
}
function normalizeMap(map) {
  const out = new Map();
  for (const [path, headers] of map) {
    const key = normalizePath(path);
    const merged = out.get(key) ?? new Map();
    for (const [k, v] of headers) merged.set(k, v);
    out.set(key, merged);
  }
  return out;
}

console.log("\n=== Launch configuration check ===\n");

/* ── 1. The flag ───────────────────────────────────────────────────────── */
const viteCfg = read("vite.config.ts");
if (viteCfg === null) {
  fail("vite.config.ts not found");
  process.exit(1);
}
const flagMatch = /^const PRELAUNCH_NOINDEX = (true|false);/m.exec(viteCfg);
if (flagMatch === null) {
  fail("could not find `const PRELAUNCH_NOINDEX = true|false;` in vite.config.ts");
  process.exit(1);
}
const noindex = flagMatch[1] === "true";
const originMatch = /^const SITE_ORIGIN = "([^"]+)";/m.exec(viteCfg);
console.log(`[1] vite.config.ts`);
ok(`PRELAUNCH_NOINDEX = ${String(noindex)}  ${noindex ? "(pre-launch: search engines blocked)" : "(LAUNCHED: site is indexable)"}`);
if (originMatch === null) fail("could not find `const SITE_ORIGIN = \"…\";` in vite.config.ts");
else {
  ok(`SITE_ORIGIN = ${originMatch[1]}`);
  if (originMatch[1].endsWith("/")) fail("SITE_ORIGIN must not end with a trailing slash");
}

/* ── 2. The inline-bootstrap hash the CSP depends on ──────────────────── */
console.log(`\n[2] CSP hash vs the inline bootstrap in index.html`);
const indexHtml = read("index.html");
let expectedHash = null;
if (indexHtml === null) fail("index.html not found");
else {
  const inline = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/.exec(indexHtml);
  if (inline === null) fail("no inline <script> found in index.html");
  else {
    expectedHash = `sha256-${createHash("sha256").update(inline[1], "utf8").digest("base64")}`;
    ok(`inline script is ${Buffer.byteLength(inline[1], "utf8")} bytes -> '${expectedHash}'`);
  }
}

/* ── 3. public/_headers ────────────────────────────────────────────────── */
console.log(`\n[3] public/_headers  (Cloudflare Pages - PRIMARY)`);
const headersText = read("public/_headers");
let cfMap = new Map();
if (headersText === null) fail("public/_headers not found");
else {
  cfMap = normalizeMap(parseHeadersFile(headersText));
  const robots = [...cfMap.values()].some((h) => h.has("x-robots-tag"));
  if (robots === noindex) {
    ok(`X-Robots-Tag ${robots ? "present" : "absent"} - agrees with the flag`);
  } else if (noindex) {
    fail("PRELAUNCH_NOINDEX is true but public/_headers has NO X-Robots-Tag - the host will let crawlers in");
  } else {
    fail("PRELAUNCH_NOINDEX is false but public/_headers still sends X-Robots-Tag: noindex - the live site will stay out of search");
  }

  const csp = [...cfMap.values()]
    .map((h) => h.get("content-security-policy-report-only") ?? h.get("content-security-policy"))
    .find((v) => v !== undefined);
  if (csp === undefined) fail("no CSP header in public/_headers");
  else {
    if (expectedHash !== null && !csp.includes(`'${expectedHash}'`)) {
      fail(`CSP script-src does not contain the current bootstrap hash. Expected '${expectedHash}'. The inline script in index.html was edited - update public/_headers AND vercel.json.`);
    } else if (expectedHash !== null) {
      ok("CSP script-src carries the current bootstrap hash");
    }
    if (csp.includes("report-only") === false && [...cfMap.values()].some((h) => h.has("content-security-policy"))) {
      note("CSP is ENFORCING (not Report-Only) - make sure a full zero-violation pass was done");
    } else {
      ok("CSP is Report-Only (safe mode)");
    }
    /* Directive-specific, not a substring search: `blob:` also appears in
       worker-src, so a plain includes() would miss its removal from
       img-src — the one place it is load-bearing. */
    const imgSrc = /(?:^|;)\s*img-src\s([^;]*)/.exec(csp);
    if (imgSrc === null) fail("CSP has no img-src directive");
    else if (!/\bblob:/.test(imgSrc[1])) {
      fail("CSP img-src is missing blob: - GLTFLoader turns the EXT_texture_webp textures inside the GLBs into blob URLs, so every model would render untextured");
    } else ok("CSP img-src allows blob: (required by the GLB textures)");
  }
}

/* ── 4. vercel.json ────────────────────────────────────────────────────── */
console.log(`\n[4] vercel.json  (Vercel preview mirror)`);
const vercelText = read("vercel.json");
let vcMap = new Map();
if (vercelText === null) {
  note("vercel.json not found - skipping (only needed for the Vercel preview)");
} else {
  let json = null;
  try {
    json = JSON.parse(vercelText);
  } catch (e) {
    fail(`vercel.json is not valid JSON: ${String(e.message)}`);
  }
  if (json !== null) {
    vcMap = normalizeMap(parseVercel(json));
    if (json.rewrites !== undefined || json.routes !== undefined || json.cleanUrls !== undefined) {
      note("vercel.json defines rewrites/routes/cleanUrls - the hash router needs none, and Cloudflare Pages cannot mirror them");
    }
    const robots = [...vcMap.values()].some((h) => h.has("x-robots-tag"));
    if (robots === noindex) {
      ok(`X-Robots-Tag ${robots ? "present" : "absent"} - agrees with the flag`);
    } else if (noindex) {
      fail("PRELAUNCH_NOINDEX is true but vercel.json has NO X-Robots-Tag");
    } else {
      fail("PRELAUNCH_NOINDEX is false but vercel.json still sends X-Robots-Tag: noindex");
    }
    const csp = [...vcMap.values()]
      .map((h) => h.get("content-security-policy-report-only") ?? h.get("content-security-policy"))
      .find((v) => v !== undefined);
    if (csp === undefined) fail("no CSP header in vercel.json");
    else if (expectedHash !== null && !csp.includes(`'${expectedHash}'`)) {
      fail(`vercel.json CSP does not contain the current bootstrap hash '${expectedHash}'`);
    } else ok("CSP script-src carries the current bootstrap hash");
  }
}

/* ── 5. Do the two header files agree? ─────────────────────────────────── */
console.log(`\n[5] public/_headers vs vercel.json`);
if (cfMap.size > 0 && vcMap.size > 0) {
  const paths = new Set([...cfMap.keys(), ...vcMap.keys()]);
  let diffs = 0;
  for (const path of [...paths].sort()) {
    const a = cfMap.get(path);
    const b = vcMap.get(path);
    if (a === undefined) {
      fail(`${path} is configured in vercel.json but missing from public/_headers`);
      diffs++;
      continue;
    }
    if (b === undefined) {
      fail(`${path} is configured in public/_headers but missing from vercel.json`);
      diffs++;
      continue;
    }
    for (const key of new Set([...a.keys(), ...b.keys()])) {
      const av = a.get(key);
      const bv = b.get(key);
      if (av !== bv) {
        fail(`${path} -> ${key} differs:\n          _headers:    ${av ?? "(absent)"}\n          vercel.json: ${bv ?? "(absent)"}`);
        diffs++;
      }
    }
  }
  if (diffs === 0) ok(`all ${paths.size} path rules match on every header`);
} else {
  note("skipped - one of the two files could not be parsed");
}

/* ── 6. Built output, if present ───────────────────────────────────────── */
console.log(`\n[6] dist/  (last build)`);
if (!existsSync("dist")) {
  note("no dist/ - run `npm run build` to check the generated artifacts too");
} else {
  const distHtml = read("dist/index.html");
  if (distHtml === null) fail("dist/index.html missing");
  else {
    const hasMeta = /<meta[^>]+name=["']robots["'][^>]*noindex/i.test(distHtml);
    if (hasMeta === noindex) ok(`<meta name="robots"> ${hasMeta ? "present" : "absent"} - agrees with the flag`);
    else if (noindex) fail("flag is true but dist/index.html has no robots meta - rebuild");
    else fail("flag is false but dist/index.html still has a noindex robots meta - rebuild");

    if (distHtml.includes("__SITE_ORIGIN__")) fail("dist/index.html still contains the literal __SITE_ORIGIN__ token - the vite plugin did not run");
    else ok("__SITE_ORIGIN__ was substituted");

    const inlineDist = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/.exec(distHtml);
    if (inlineDist !== null && expectedHash !== null) {
      const builtHash = `sha256-${createHash("sha256").update(inlineDist[1], "utf8").digest("base64")}`;
      if (builtHash === expectedHash) ok("built inline script hashes identically to the source");
      else fail(`the BUILT inline script hash '${builtHash}' differs from the source '${expectedHash}' - something transformed index.html`);
    }
  }

  const distRobots = read("dist/robots.txt");
  if (distRobots === null) fail("dist/robots.txt missing - the vite plugin did not emit it");
  else {
    const disallows = /^\s*Disallow:\s*\/\s*$/m.test(distRobots);
    if (disallows === noindex) ok(`robots.txt ${disallows ? "disallows all" : "allows crawling"} - agrees with the flag`);
    else if (noindex) fail("flag is true but dist/robots.txt does not Disallow: / - rebuild");
    else fail("flag is false but dist/robots.txt still has Disallow: / - rebuild");
  }

  if (existsSync("dist/_headers")) ok("dist/_headers was copied (Cloudflare Pages will read it)");
  else fail("dist/_headers missing - Cloudflare Pages would serve NO custom headers");

  if (existsSync("dist/404.html")) ok("dist/404.html was copied");
  else fail("dist/404.html missing - unknown paths would fall back to the host's default page");
}

/* ── Summary ───────────────────────────────────────────────────────────── */
console.log("\n=== Summary ===");
if (problems.length === 0) {
  console.log(`  PASS - configuration is consistent (${String(notes.length)} note${notes.length === 1 ? "" : "s"})`);
  console.log(noindex
    ? "  Current state: PRE-LAUNCH. Search engines are blocked by all three mechanisms."
    : "  Current state: LAUNCHED. The site is indexable.");
  process.exit(0);
}
console.log(`  ${String(problems.length)} problem${problems.length === 1 ? "" : "s"} found:`);
problems.forEach((p, i) => {
  console.log(`   ${String(i + 1)}. ${p.split("\n")[0]}`);
});
console.log("\n  See the \"Deployment and launch\" section in README.md.");
process.exit(1);
