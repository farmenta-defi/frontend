import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { NextConfig } from "next";

/**
 * The address manifest named by NEXT_PUBLIC_FARMENTA_DEPLOYMENT, as JSON text,
 * or nothing when the variable is unset or empty: the app then builds with
 * its actions disabled (see deployments/README.md). A name without a file
 * stops the build, because that is a typo and not a choice.
 *
 * Resolved from the working directory, which `next` sets to the project root.
 */
function manifest(): string | undefined {
  const name = process.env.NEXT_PUBLIC_FARMENTA_DEPLOYMENT?.trim();
  if (!name) return undefined;

  const file = join(process.cwd(), "deployments", `${name}.json`);
  if (!existsSync(file)) {
    throw new Error(`NEXT_PUBLIC_FARMENTA_DEPLOYMENT=${name}, but ${file} does not exist`);
  }
  return JSON.stringify(JSON.parse(readFileSync(file, "utf8")));
}

const deploymentManifest = manifest();

const nextConfig: NextConfig = {
  // @coinbase/cdp-sdk (pulled in transitively by wagmi's Base Account connector)
  // lazily imports optional "@x402/core/*" modules we never use; keep it out of
  // the server bundle so Turbopack doesn't try to resolve them.
  serverExternalPackages: ["@coinbase/cdp-sdk"],
  // Read by src/lib/deployment.ts, which validates it.
  env: deploymentManifest ? { NEXT_PUBLIC_FARMENTA_MANIFEST: deploymentManifest } : {},
};

export default nextConfig;
