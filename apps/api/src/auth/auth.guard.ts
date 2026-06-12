import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { AuthService } from "./auth.service";
import { SESSION_COOKIE } from "./constants";
import { IS_PUBLIC_KEY } from "./decorators";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Global guard. Validates the session cookie (or Bearer token) on every request
 * and attaches the authenticated user. Routes marked @Public() are skipped.
 */
@Injectable()
export class AuthGuard implements CanActivate {
    constructor(
        private readonly auth: AuthService,
        private readonly reflector: Reflector,
    ) {}

    async canActivate(ctx: ExecutionContext): Promise<boolean> {
        const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
            ctx.getHandler(),
            ctx.getClass(),
        ]);
        if (isPublic) return true;

        const req = ctx.switchToHttp().getRequest<Request & { user?: unknown }>();
        const cookieToken = (req as Request & { cookies?: Record<string, string> }).cookies?.[SESSION_COOKIE];
        const token = this.extractToken(req);
        if (!token) throw new UnauthorizedException("Not authenticated.");

        // CSRF defence for cookie-authenticated mutations: require a custom header
        // that a cross-site <form>/<img> request can't set (and a cross-origin fetch
        // can't add without a CORS preflight we don't grant). Bearer-token API
        // clients are unaffected (they don't rely on the ambient cookie). This
        // closes the gap SameSite=Lax leaves for top-level/simple requests.
        if (cookieToken && !SAFE_METHODS.has(req.method.toUpperCase()) && !req.headers["x-requested-with"]) {
            throw new ForbiddenException("Missing X-Requested-With header (CSRF protection).");
        }

        const user = await this.auth.validate(token, req.ip);
        if (!user) throw new UnauthorizedException("Session expired or invalid.");

        req.user = user;
        return true;
    }

    private extractToken(req: Request): string | null {
        const cookieToken = (req as Request & { cookies?: Record<string, string> }).cookies?.[
            SESSION_COOKIE
        ];
        if (cookieToken) return cookieToken;
        const auth = req.headers.authorization;
        if (auth?.startsWith("Bearer ")) return auth.slice(7);
        return null;
    }
}
