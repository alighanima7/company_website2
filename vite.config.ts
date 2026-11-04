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
          fx: ["postprocessing", "@react-three/postprocessing"],
          gsap: ["gsap", "lenis"],
        },
      },
    },
    chunkSizeWarningLimit: 1200,
  },
});
