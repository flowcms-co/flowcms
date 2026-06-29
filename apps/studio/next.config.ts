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
  async headers() {
    return [
      {
        // Never cache the HTML shell (or the manifest / data documents). On iOS a
        // home-screen shortcut keeps its own cache that "Clear Website Data" never
        // touches, so a stale shell pins old hashed chunks and the app shows an old
        // copy. Forcing the shell to revalidate makes new deploys land on launch.
        // Immutable, content-hashed assets (/_next/static, /_next/image) and the
        // static brand/image/email dirs are excluded so they keep their long cache.
        source: "/:path((?!_next/static|_next/image|favicon|brand|images|email).*)",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
