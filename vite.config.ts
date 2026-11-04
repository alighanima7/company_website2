import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
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
          gsap: ["gsap", "lenis"],
        },
      },
    },
    chunkSizeWarningLimit: 1200,
  },
});
