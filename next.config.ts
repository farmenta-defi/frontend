import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @coinbase/cdp-sdk (pulled in transitively by wagmi's Base Account connector)
  // lazily imports optional "@x402/core/*" modules we never use; keep it out of
  // the server bundle so Turbopack doesn't try to resolve them.
  serverExternalPackages: ["@coinbase/cdp-sdk"],
};

export default nextConfig;
