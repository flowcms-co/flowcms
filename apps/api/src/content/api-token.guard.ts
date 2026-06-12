import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { hashToken } from "@flowcms/shared";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Authenticates the public/agent API via a Bearer API token (hashed in the DB).
 * Attaches the resolved token (workspace + scopes) to the request. Pair with
 * @Public() so the session AuthGuard is skipped on these routes.
 */
@Injectable()
export class ApiTokenGuard implements CanActivate {
    constructor(private readonly prisma: PrismaService) {}

    async canActivate(ctx: ExecutionContext): Promise<boolean> {
        const req = ctx.switchToHttp().getRequest<Request & { apiToken?: unknown }>();
        const auth = req.headers.authorization;
        if (!auth?.startsWith("Bearer ")) {
            throw new UnauthorizedException("Missing API token (use 'Authorization: Bearer <token>').");
        }
        const token = await this.prisma.apiToken.findUnique({
            where: { tokenHash: hashToken(auth.slice(7)) },
        });
        if (!token || token.revokedAt || (token.expiresAt && token.expiresAt < new Date())) {
            throw new UnauthorizedException("Invalid or expired API token.");
        }
        // Best-effort last-used stamp (don't block the request on it).
        void this.prisma.apiToken
            .update({ where: { id: token.id }, data: { lastUsedAt: new Date() } })
            .catch(() => {});
        req.apiToken = token;
        return true;
    }
}
