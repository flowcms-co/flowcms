import { Body, Controller, Delete, Get, Param, Post, UseGuards } from "@nestjs/common";
import { PERMISSIONS } from "@flowcms/shared";
import { CurrentUser, RequirePermissions } from "../../auth/decorators";
import type { AuthUser } from "../../auth/types";
import { FeatureGuard, RequireFeature } from "../../license/feature.guard";
import { ScimService } from "./scim.service";

/**
 * EE (Enterprise) — SCIM token lifecycle (studio side). Session-authed + gated by
 * `scim`; mints/lists/revokes the bearer tokens an IdP uses against /scim/v2.
 */
@Controller("ee/scim/tokens")
@UseGuards(FeatureGuard)
@RequireFeature("scim")
export class ScimAdminController {
    constructor(private readonly scim: ScimService) {}

    @Get()
    @RequirePermissions(PERMISSIONS.SECURITY_MANAGE)
    list(@CurrentUser() user: AuthUser) {
        return this.scim.listTokens(user.workspaceId);
    }

    @Post()
    @RequirePermissions(PERMISSIONS.SECURITY_MANAGE)
    mint(@CurrentUser() user: AuthUser, @Body("name") name?: string) {
        return this.scim.mintToken(user.workspaceId, user.id, name);
    }

    @Delete(":id")
    @RequirePermissions(PERMISSIONS.SECURITY_MANAGE)
    revoke(@CurrentUser() user: AuthUser, @Param("id") id: string) {
        return this.scim.revokeToken(user.workspaceId, id);
    }
}
