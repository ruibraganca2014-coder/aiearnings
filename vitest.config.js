import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Testes: backend em node, frontend em jsdom (por ficheiro via `// @vitest-environment jsdom`).
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.{js,mjs,jsx}"],
  },
});
