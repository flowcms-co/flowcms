import { Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { createHash } from "node:crypto";
import { SESSION_COOKIE } from "../auth/constants";

/**
 * Rate-limit bucket key, most-specific first:
 *   1. Bearer API token  → per-token  (public/agent/Strapi/GraphQL delivery)
 *   2. session cookie     → per-session (a logged-in studio user — so many users
 *      behind ONE office NAT IP don't share, and can't starve, a bucket)
 *   3. client IP          → unauthenticated routes (signin/forgot/reset),
 *      which is exactly where per-IP brute-force throttling belongs.
 *
 * Secrets are hashed before they're used as a key, so a raw token/session value
 * never lands in the throttler store.
 */
@Injectable()
export class TokenOrIpThrottlerGuard extends ThrottlerGuard {
    protected async getTracker(req: Record<string, unknown>): Promise<string> {
        const headers = (req.headers ?? {}) as Record<string, string | undefined>;
        const auth = headers.authorization;
        if (auth?.startsWith("Bearer ")) return `tok:${this.hash(auth.slice(7))}`;

        const cookies = (req.cookies ?? {}) as Record<string, string | undefined>;
        const sess = cookies[SESSION_COOKIE];
        if (sess) return `sess:${this.hash(sess)}`;

        const ip = (req.ip as string) || "unknown";
        return `ip:${ip}`;
    }

    private hash(secret: string): string {
        return createHash("sha256").update(secret).digest("hex").slice(0, 32);
    }
}
