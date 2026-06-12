import { Body, Controller, Get, Param, Patch } from "@nestjs/common";
import { IsBoolean, IsObject, IsOptional } from "class-validator";
import { PERMISSIONS } from "@flowcms/shared";
import { CurrentUser, RequirePermissions } from "../auth/decorators";
import type { AuthUser } from "../auth/types";
import { PluginsService } from "./plugins.service";

class UpdatePluginDto {
    @IsOptional() @IsBoolean() enabled?: boolean;
    @IsOptional() @IsObject() config?: Record<string, unknown>;
}

@Controller("plugins")
@RequirePermissions(PERMISSIONS.WORKSPACE_MANAGE)
export class PluginsController {
    constructor(private readonly plugins: PluginsService) {}

    @Get()
    list(@CurrentUser() user: AuthUser) {
        return this.plugins.list(user.workspaceId);
    }

    @Patch(":key")
    update(@CurrentUser() user: AuthUser, @Param("key") key: string, @Body() dto: UpdatePluginDto) {
        return this.plugins.update(user.workspaceId, key, dto);
    }
}
