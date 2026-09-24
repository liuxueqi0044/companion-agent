import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "apps/**/*.test.ts",
      "packages/**/*.test.ts",
      "reports/evidence/**/*.test.ts",
      "tests/unit/**/*.test.ts",
    ],
    environment: "node",
    passWithNoTests: false,
  },
});
