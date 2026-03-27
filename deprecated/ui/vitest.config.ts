import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["packages/**", "node_modules/**"],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
      "@meowtieheightgent/shared": resolve(__dirname, "../packages/shared/src/index.ts"),
      "@meowtieheightgent/adapter-utils": resolve(__dirname, "../packages/adapter-utils/src/index.ts"),
    },
  },
});
