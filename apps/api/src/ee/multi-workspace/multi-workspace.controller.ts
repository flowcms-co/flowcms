import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { IsOptional, IsString } from "class-validator";
import { PERMISSIONS } from "@flowcms/shared";
import { CurrentUser, RequirePermissions } from "../../auth/decorators";
import type { AuthUser } from "../../auth/types";
import { FeatureGuard, RequireFeature } from "../../license/feature.guard";
import { MultiWorkspaceService } from "./multi-workspace.service";

class CreateWorkspaceDto {
    @IsString() name!: string;
    @IsOptional() @IsString() slug?: string;
}

/**
 * EE (Enterprise) — create additional workspaces. Listing + switching the active
 * workspace are core (workspace/workspaces.controller); only *provisioning* more
 * is the paid lever, gated by `multi_workspace` (Community → 403). The new
 * workspace's creator becomes its owner.
 */
@Controller("workspaces")
@UseGuards(FeatureGuard)
@RequireFeature("multi_workspace")
export class MultiWorkspaceController {
    constructor(private readonly workspaces: MultiWorkspaceService) {}

    @Post()
    @RequirePermissions(PERMISSIONS.WORKSPACE_MANAGE)
    create(@CurrentUser() user: AuthUser, @Body() dto: CreateWorkspaceDto) {
        return this.workspaces.create(user.id, dto.name, dto.slug);
    }
}
