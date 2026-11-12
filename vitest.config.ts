import { defineConfig } from "vitest/config";

// Kept separate from vite.config.ts so the app build and the test runner do not
// have to share one Vite type version. The catalog tests are pure TypeScript
// and do not need the React plugin.
export default defineConfig({
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
