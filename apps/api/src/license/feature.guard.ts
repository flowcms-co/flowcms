import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { LicenseService } from "./license.service";

export const FEATURE_KEY = "flow:feature";

/** Gate a route/controller on a paid entitlement: `@RequireFeature("audit_export")`. */
export const RequireFeature = (feature: string) => SetMetadata(FEATURE_KEY, feature);

/**
 * Allows the request only if the install's license unlocks the named feature.
 * This is the single runtime check the paid (ee/) modules rely on — Community
 * installs get a clear 403 pointing at Settings → License.
 */
@Injectable()
export class FeatureGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly license: LicenseService,
    ) {}

    async canActivate(ctx: ExecutionContext): Promise<boolean> {
        const feature = this.reflector.getAllAndOverride<string | undefined>(FEATURE_KEY, [ctx.getHandler(), ctx.getClass()]);
        if (!feature) return true;
        if (await this.license.has(feature)) return true;
        throw new ForbiddenException(`This feature ("${feature}") requires a Flow CMS plan that includes it. See Settings → License.`);
    }
}
