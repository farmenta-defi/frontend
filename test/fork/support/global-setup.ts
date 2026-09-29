import type { TestProject } from "vitest/node";

import { startFork } from "../../../scripts/fork.mjs";

/**
 * One fork per run, started by `scripts/fork.mjs`, the same code `pnpm fork`
 * runs for the app. The tests get its URL and the manifest of the deployment
 * on it, and read the manifest the way the app reads one.
 */
declare module "vitest" {
  export interface ProvidedContext {
    forkUrl: string;
    manifest: string;
  }
}

export default async function setup(project: TestProject) {
  const { url, manifest, stop } = await startFork();
  project.provide("forkUrl", url);
  project.provide("manifest", manifest);
  return stop;
}
