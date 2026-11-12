import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri serves the built frontend from a custom protocol, so asset URLs must
// stay relative. The dev server binds loopback only.
export default defineConfig({
  plugins: [react()],
  base: "./",
  clearScreen: false,
  server: {
    port: 1430,
    strictPort: true,
    host: "127.0.0.1",
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "es2022",
    sourcemap: false,
  },
});
