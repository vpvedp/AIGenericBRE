import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Vitest = the test runner. `npm test` runs every *.test.ts file below.
export default defineConfig({
  resolve: {
    // Same "@/..." import shortcut the app uses (see tsconfig.json "paths").
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts", "ai-training/**/*.test.ts"],
    environment: "node", // these tests check logic, not React screens
  },
});
