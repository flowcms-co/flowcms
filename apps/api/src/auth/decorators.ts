import { createParamDecorator, ExecutionContext, SetMetadata } from "@nestjs/common";
import type { AuthUser } from "./types";

/** Mark a route as public (skips the global AuthGuard). */
export const IS_PUBLIC_KEY = "isPublic";
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Require one or more permission keys on a route (enforced by PermissionsGuard). */
export const PERMISSIONS_KEY = "permissions";
export const RequirePermissions = (...permissions: string[]) =>
    SetMetadata(PERMISSIONS_KEY, permissions);

/** Inject the authenticated user into a handler param. */
export const CurrentUser = createParamDecorator(
    (_data: unknown, ctx: ExecutionContext): AuthUser => {
        return ctx.switchToHttp().getRequest().user;
    },
);
