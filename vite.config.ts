import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    // The lazily loaded Three.js core is ~522 KB minified (~130 KB gzipped).
    // Its dedicated chunk is requested only when the 3D movement guide opens.
    chunkSizeWarningLimit: 550,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/node_modules/three/")) return "three-vendor";
        },
      },
    },
  },
});
