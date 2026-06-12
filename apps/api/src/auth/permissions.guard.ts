import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { can } from "@flowcms/shared";
import { PERMISSIONS_KEY } from "./decorators";
import type { AuthUser } from "./types";

/**
 * Enforces @RequirePermissions(...) on routes. Runs after AuthGuard, so the
 * user is already attached. A role with "*" passes everything.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
    constructor(private readonly reflector: Reflector) {}

    canActivate(ctx: ExecutionContext): boolean {
        const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
            ctx.getHandler(),
            ctx.getClass(),
        ]);
        if (!required || required.length === 0) return true;

        const user: AuthUser | undefined = ctx.switchToHttp().getRequest().user;
        if (!user) throw new ForbiddenException("Not authorized.");

        const ok = required.every((perm) => can(user.role.permissions, perm));
        if (!ok) throw new ForbiddenException("You do not have permission to do that.");
        return true;
    }
}
