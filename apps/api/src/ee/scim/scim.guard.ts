import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { hashToken } from "@flowcms/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { LicenseService } from "../../license/license.service";

/**
 * Authenticates SCIM 2.0 requests via a Bearer token of type SCIM, and gates the
 * whole protocol on the `scim` entitlement (Community → 403). Attaches the token's
 * workspace id to the request. Pair with @Public() so the session AuthGuard skips.
 */
@Injectable()
export class ScimGuard implements CanActivate {
    constructor(
        private readonly prisma: PrismaService,
        private readonly license: LicenseService,
    ) {}

    async canActivate(ctx: ExecutionContext): Promise<boolean> {
        if (!(await this.license.has("scim"))) {
            throw new ForbiddenException("SCIM provisioning requires a Flow CMS plan that includes it.");
        }
        const req = ctx.switchToHttp().getRequest<Request & { scimWorkspaceId?: string }>();
        const auth = req.headers.authorization;
        if (!auth?.startsWith("Bearer ")) throw new UnauthorizedException("Missing SCIM bearer token.");
        const token = await this.prisma.apiToken.findUnique({ where: { tokenHash: hashToken(auth.slice(7)) } });
        if (!token || token.revokedAt || token.type !== "SCIM" || (token.expiresAt && token.expiresAt < new Date())) {
            throw new UnauthorizedException("Invalid or expired SCIM token.");
        }
        void this.prisma.apiToken.update({ where: { id: token.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
        req.scimWorkspaceId = token.workspaceId;
        return true;
    }
}
