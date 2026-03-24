import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Resolve workspace packages from the monorepo root packages/
      "@meowtieheightgent/shared": path.resolve(__dirname, "../packages/shared/src/index.ts"),
      "@meowtieheightgent/adapter-utils": path.resolve(__dirname, "../packages/adapter-utils/src/index.ts"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3100",
        ws: true,
      },
      "/chat/ws": {
        target: "http://localhost:3100",
        ws: true,
      },
    },
  },
});
