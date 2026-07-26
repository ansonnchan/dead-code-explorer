import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    testTimeout: 20_000,
    coverage: {
      reporter: ["text", "html"],
      include: ["src/analysis/**/*.ts"]
    }
  }
});
