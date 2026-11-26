import { createRoot } from "react-dom/client";

import { App } from "./App";
import { PERF } from "./perf/probe";
import { POSTER } from "./poster/flag";
import "./styles.css";

const container = document.getElementById("root");
if (container === null) throw new Error("#root missing");

// Poster-capture mode (?poster=<id>&theme=…): the boot must run BEFORE
// React mounts — it stamps the theme, freezes motion and sets the hash the
// router will parse as the initial location. Lazy chunk, same zero-cost
// contract as the perf harness. See src/poster/boot.ts.
if (POSTER.on) {
  void import("./poster/boot").then((m) => {
    m.boot(POSTER.id, POSTER.theme);
    createRoot(container).render(<App />);
  });
} else {
  createRoot(container).render(<App />);
}

// Opt-in measurement harness (?perf=1). Its own Rollup chunk — a normal
// visitor resolves one boolean and never requests it. See src/perf/probe.ts.
if (PERF) {
  void import("./perf/overlay").then((m) => {
    m.mount();
  });
}
