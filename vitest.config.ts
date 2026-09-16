import { defineConfig } from "vitest/config";
import path from "node:path";

// Resolves the same "@/*" -> "./src/*" alias tsconfig.json already declares
// for the app itself, so `import ... from "@/lib/..."` works inside test
// files too. Without this, every test file under tests/ that imports
// anything via the @ alias fails at import time with "Cannot find package
// '@/...'" -- vitest doesn't read tsconfig `paths` on its own, and this
// project has no tsconfig-paths plugin installed. Deliberately just an
// alias, not `vite-tsconfig-paths` or another new dependency -- the app
// only has this one alias to resolve.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
