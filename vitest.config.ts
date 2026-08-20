import { defineConfig } from "vitest/config";
import path from "node:path";

// Config for the small, targeted test suite under tests/ -- covers the
// security-critical paths (per-user data isolation, rate limiting) that
// were flagged as untested during the vibe-coding security review. Not a
// full test suite; see tests/README.md for scope and how to extend it.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
