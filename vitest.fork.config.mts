import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * `pnpm test:fork`: the on-chain flows against an anvil fork of Robinhood
 * Chain that `script/Deploy.s.sol` has deployed to. No mock stands in for a
 * contract. See test/fork/README.md for what it needs.
 *
 * One anvil, one file at a time: every test runs inside a snapshot, and two
 * files sharing the chain would revert each other's state.
 */
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["test/fork/**/*.test.ts"],
    globalSetup: ["test/fork/support/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
