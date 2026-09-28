import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * `pnpm test` runs what needs no network. The flows against the contracts run
 * on an anvil fork from their own config, `vitest.fork.config.ts`.
 */
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
