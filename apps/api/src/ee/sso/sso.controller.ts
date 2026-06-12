import { Body, Controller, Get, Put, UseGuards } from "@nestjs/common";
import { PERMISSIONS } from "@flowcms/shared";
import { CurrentUser, RequirePermissions } from "../../auth/decorators";
import type { AuthUser } from "../../auth/types";
import { FeatureGuard, RequireFeature } from "../../license/feature.guard";
import { SsoService } from "./sso.service";

type SsoConfigBody = {
    enabled?: boolean;
    issuer?: string;
    authorizationUrl?: string;
    tokenUrl?: string;
    jwksUri?: string;
    clientId?: string;
    clientSecret?: string;
    autoProvision?: boolean;
    allowedDomain?: string;
};

/**
 * EE (Enterprise) — SSO config (studio side). Session-authed + gated by `sso`;
 * reads/writes the active workspace's OIDC settings (the clientSecret is stored
 * encrypted and never returned).
 */
@Controller("ee/sso")
@UseGuards(FeatureGuard)
@RequireFeature("sso")
export class SsoController {
    constructor(private readonly sso: SsoService) {}

    @Get()
    @RequirePermissions(PERMISSIONS.SECURITY_MANAGE)
    get(@CurrentUser() user: AuthUser) {
        return this.sso.getConfig(user.workspaceId);
    }

    @Put()
    @RequirePermissions(PERMISSIONS.SECURITY_MANAGE)
    update(@CurrentUser() user: AuthUser, @Body() body: SsoConfigBody) {
        return this.sso.setConfig(user.workspaceId, body);
    }
}
