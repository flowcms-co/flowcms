import { Body, Controller, Get, Put, UseGuards } from "@nestjs/common";
import { IsOptional, IsString, MaxLength } from "class-validator";
import { PERMISSIONS } from "@flowcms/shared";
import { CurrentUser, RequirePermissions } from "../../auth/decorators";
import type { AuthUser } from "../../auth/types";
import { FeatureGuard, RequireFeature } from "../../license/feature.guard";
import { ContentRulesService } from "./content-rules.service";

class GuideDto {
    /** An https address, or empty to clear the guide link. */
    @IsString() @MaxLength(2048) url!: string;
    @IsOptional() @IsString() @MaxLength(80) label?: string;
    /** One content type; leave out to apply to every type that has rules. */
    @IsOptional() @IsString() typeId?: string;
}

/**
 * EE (Enterprise) — the guide link shown with content rule messages. Enforcement runs in the
 * core content engine (via the ContentRulesPort this module provides); this only configures
 * the link. Gated by `content_rules`.
 */
@Controller("ee/content-rules")
@UseGuards(FeatureGuard)
@RequireFeature("content_rules")
export class ContentRulesController {
    constructor(private readonly rules: ContentRulesService) {}

    @Get("guides")
    @RequirePermissions(PERMISSIONS.WORKSPACE_MANAGE)
    guides(@CurrentUser() user: AuthUser) {
        return this.rules.listGuides(user.workspaceId);
    }

    @Put("guide")
    @RequirePermissions(PERMISSIONS.WORKSPACE_MANAGE)
    setGuide(@CurrentUser() user: AuthUser, @Body() dto: GuideDto) {
        return this.rules.setGuide(user.workspaceId, dto);
    }
}
