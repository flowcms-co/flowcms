import { Body, Controller, Get, HttpCode, Post, Put, UseGuards } from "@nestjs/common";
import { IsArray, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import { PERMISSIONS } from "@flowcms/shared";
import { CurrentUser, RequirePermissions } from "../../auth/decorators";
import type { AuthUser } from "../../auth/types";
import { FeatureGuard, RequireFeature } from "../../license/feature.guard";
import { IpPoliciesService } from "./ip-policies.service";

class PolicyDto {
    @IsOptional() @IsArray() @IsString({ each: true }) @MaxLength(64, { each: true }) ipAllowlist?: string[];
    @IsOptional() @IsInt() @Min(0) @Max(8760) sessionMaxHours?: number; // 0 = no cap
    @IsOptional() @IsInt() @Min(0) @Max(1440) sessionIdleMinutes?: number; // 0 = no idle limit
}

/**
 * EE (Enterprise) — IP allowlist + session policy config + force sign-out. The
 * enforcement runs in the core auth layer (via the SessionPolicyPort this service
 * implements); these endpoints just configure it. Gated by `ip_policies`.
 */
@Controller("ee/ip-policies")
@UseGuards(FeatureGuard)
@RequireFeature("ip_policies")
export class IpPoliciesController {
    constructor(private readonly policies: IpPoliciesService) {}

    @Get()
    get(@CurrentUser() user: AuthUser) {
        return this.policies.getPolicy(user.workspaceId);
    }

    @Put()
    @RequirePermissions(PERMISSIONS.SECURITY_MANAGE)
    set(@CurrentUser() user: AuthUser, @Body() dto: PolicyDto) {
        return this.policies.setPolicy(user.workspaceId, dto);
    }

    /** Force sign-out everywhere: revoke every session for this workspace's members. */
    @Post("revoke-sessions")
    @HttpCode(200)
    @RequirePermissions(PERMISSIONS.SECURITY_MANAGE)
    revoke(@CurrentUser() user: AuthUser) {
        return this.policies.revokeAll(user.workspaceId);
    }
}
