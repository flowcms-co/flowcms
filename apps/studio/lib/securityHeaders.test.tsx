import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

describe("Studio security headers", () => {
    it("sends the security headers on every route", async () => {
        const rules = (await nextConfig.headers!()) as { source: string; headers: { key: string; value: string }[] }[];
        const all = rules.find((r) => r.source === "/:path*");
        const h = Object.fromEntries((all?.headers ?? []).map((x) => [x.key, x.value]));
        expect(h["Strict-Transport-Security"]).toBe("max-age=31536000; includeSubDomains");
        expect(h["X-Content-Type-Options"]).toBe("nosniff");
        expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
        expect(h["Permissions-Policy"]).toBe("camera=(), microphone=(), geolocation=()");
        expect(h["Content-Security-Policy"]).toBe("frame-ancestors 'self'; base-uri 'self'; object-src 'none'");
        expect(h["X-Frame-Options"]).toBe("SAMEORIGIN");
    });
});
