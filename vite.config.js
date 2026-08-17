import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

// Three entry points, so Mert's data tooling never has to live behind a route
// in Aaron's App.jsx. That's the whole reason the ownership map has no overlap.
//
//   /              main app          Aaron
//   /collect.html  capture mode      Mert (M3)
//   /train.html    training mode     Mert (M4)
//   /import.html   dataset import    Mert
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    allowedHosts: true,
  },
  preview: {
    host: true,
    port: 4173,
    allowedHosts: true,
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(root, "index.html"),
        collect: resolve(root, "collect.html"),
        train: resolve(root, "train.html"),
        import: resolve(root, "import.html"),
      },
    },
  },
});
