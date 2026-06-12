import { Body, Controller, Get, Post, Put, UseGuards } from "@nestjs/common";
import { IsBoolean, IsInt, IsOptional, Max, Min } from "class-validator";
import { PERMISSIONS } from "@flowcms/shared";
import { CurrentUser, RequirePermissions } from "../../auth/decorators";
import type { AuthUser } from "../../auth/types";
import { FeatureGuard, RequireFeature } from "../../license/feature.guard";
import { SeoAutomationService } from "./seo-automation.service";

export class SeoAutomationDto {
    @IsOptional()
    @IsBoolean()
    enabled?: boolean;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(720)
    incrementalHours?: number;

    @IsOptional()
    @IsInt()
    @Min(24)
    @Max(2160)
    fullHours?: number;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(500)
    perRunCap?: number;
}

/**
 * EE (Pro+) — scheduled AI auditing config + manual trigger. Gated by
 * `seo_automation`; Community gets 403 here (and the studio shows the locked card).
 * The cadence is editable only on Enterprise (the service ignores config writes on Pro).
 */
@Controller("ee/seo-automation")
@UseGuards(FeatureGuard)
@RequireFeature("seo_automation")
export class SeoAutomationController {
    constructor(private readonly automation: SeoAutomationService) {}

    @Get()
    get(@CurrentUser() user: AuthUser) {
        return this.automation.getConfig(user.workspaceId);
    }

    @Put()
    @RequirePermissions(PERMISSIONS.WORKSPACE_MANAGE)
    set(@CurrentUser() user: AuthUser, @Body() dto: SeoAutomationDto) {
        return this.automation.setConfig(user.workspaceId, dto);
    }

    @Post("run")
    @RequirePermissions(PERMISSIONS.WORKSPACE_MANAGE)
    run(@CurrentUser() user: AuthUser) {
        return this.automation.runNow(user.workspaceId);
    }
}
