import { Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";

/**
 * Rate-limit bucket key:
 *   1. authenticated user → per-user (so many users behind ONE office NAT IP
 *      don't share, and can't starve, a bucket)
 *   2. client IP          → everything else, including every @Public route
 *      (signin/forgot/reset, public delivery), where per-IP brute-force
 *      throttling belongs.
 *
 * Runs after AuthGuard (see app.module), so `req.user` is only ever a user that
 * AuthGuard validated; it is never set on @Public routes. A raw Bearer/cookie
 * value must never pick the bucket: random values would each get a fresh one.
 */
@Injectable()
export class TokenOrIpThrottlerGuard extends ThrottlerGuard {
    protected async getTracker(req: Record<string, unknown>): Promise<string> {
        const user = req.user as { id?: string } | undefined;
        if (user?.id) return `user:${user.id}`;
        return `ip:${(req.ip as string) || "unknown"}`;
    }
}
