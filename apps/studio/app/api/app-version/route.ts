import { NextResponse } from "next/server";

// Reports the build id baked into the running server bundle. The client shell
// compares this against its own baked-in build id and reloads itself when it is
// older than the deployed server, which heals stale iOS standalone web apps.
// Must never be cached: the value has to reflect the live deploy.
export const dynamic = "force-dynamic";

export function GET() {
    return NextResponse.json(
        { buildId: process.env.NEXT_PUBLIC_BUILD_ID ?? null },
        { headers: { "Cache-Control": "no-store" } },
    );
}
