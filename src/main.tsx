import { createRoot } from "react-dom/client";

import { App } from "./App";
import { PERF } from "./perf/probe";
import "./styles.css";

const container = document.getElementById("root");
if (container === null) throw new Error("#root missing");

createRoot(container).render(<App />);

// Opt-in measurement harness (?perf=1). Its own Rollup chunk — a normal
// visitor resolves one boolean and never requests it. See src/perf/probe.ts.
if (PERF) {
  void import("./perf/overlay").then((m) => {
    m.mount();
  });
}
