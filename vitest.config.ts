import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import packageJson from "./package.json";

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(packageJson.version) },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
    },
  },
  esbuild: { jsx: "automatic" },
  test: {
    maxWorkers: 2,
    minWorkers: 1,
    fileParallelism: false,
    restoreMocks: true,
    testTimeout: 10_000,
    projects: [
      {
        extends: true,
        test: { name: "server", environment: "node", include: ["tests/**/*.test.ts"] },
      },
      {
        extends: true,
        test: {
          name: "ui",
          environment: "jsdom",
          include: ["tests/**/*.test.tsx"],
          setupFiles: ["tests/ui-setup.tsx"],
        },
      },
    ],
  },
});
