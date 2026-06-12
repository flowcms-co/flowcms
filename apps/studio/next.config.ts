import type { NextConfig } from "next";
import { join } from "node:path";

const repoRoot = join(__dirname, "..", "..");

const nextConfig: NextConfig = {
  // Lean, self-contained server bundle for the production Docker image
  // (`.next/standalone/apps/studio/server.js`) — no node_modules needed at runtime.
  output: "standalone",
  // Trace files from the monorepo root so workspace deps (@flowcms/*) and hoisted
  // root packages are bundled into the standalone output.
  outputFileTracingRoot: repoRoot,
  // Pin Turbopack's workspace root to the monorepo root. Without this, Turbopack
  // intermittently mis-infers the root and crashes with "couldn't find the
  // Next.js package from the project directory".
  turbopack: {
    root: repoRoot,
  },
};

export default nextConfig;
