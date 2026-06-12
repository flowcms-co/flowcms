import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { hashToken } from "@flowcms/shared";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Authenticates the agent (write) API. Like the read ApiTokenGuard, but only
 * AGENT or ADMIN tokens are allowed — CONTENT/PREVIEW tokens are read-only and
 * get 403. Pair with @Public() so the session guard is skipped.
 */
@Injectable()
export class AgentTokenGuard implements CanActivate {
    constructor(private readonly prisma: PrismaService) {}

    async canActivate(ctx: ExecutionContext): Promise<boolean> {
        const req = ctx.switchToHttp().getRequest<Request & { apiToken?: unknown }>();
        const auth = req.headers.authorization;
        if (!auth?.startsWith("Bearer ")) {
            throw new UnauthorizedException("Missing API token (use 'Authorization: Bearer <token>').");
        }
        const token = await this.prisma.apiToken.findUnique({ where: { tokenHash: hashToken(auth.slice(7)) } });
        if (!token || token.revokedAt || (token.expiresAt && token.expiresAt < new Date())) {
            throw new UnauthorizedException("Invalid or expired API token.");
        }
        if (token.type !== "AGENT" && token.type !== "ADMIN") {
            throw new ForbiddenException("This endpoint requires an AGENT or ADMIN token (write access).");
        }
        void this.prisma.apiToken.update({ where: { id: token.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
        req.apiToken = token;
        return true;
    }
}
