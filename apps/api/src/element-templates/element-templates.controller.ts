import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { PERMISSIONS } from "@flowcms/shared";
import { CurrentUser, RequirePermissions } from "../auth/decorators";
import type { AuthUser } from "../auth/types";
import { FeatureGuard, RequireFeature } from "../license/feature.guard";
import { ElementTemplatesService } from "./element-templates.service";

/** Workspace element templates that pages link to. Enterprise `elements`. Anyone who can read
 *  content sees them (the editor needs the values); changing them needs content-update. */
@Controller("element-templates")
@UseGuards(FeatureGuard)
@RequireFeature("elements")
@RequirePermissions(PERMISSIONS.CONTENT_READ)
export class ElementTemplatesController {
    constructor(private readonly templates: ElementTemplatesService) {}

    @Get()
    list(@CurrentUser() user: AuthUser) {
        return this.templates.list(user.workspaceId);
    }

    // Before ":id", which would otherwise take these paths.
    @Get("export")
    export(@CurrentUser() user: AuthUser) {
        return this.templates.export(user.workspaceId);
    }

    @Post("import")
    @RequirePermissions(PERMISSIONS.CONTENT_UPDATE)
    import(@CurrentUser() user: AuthUser, @Body() body: unknown) {
        return this.templates.import(user.workspaceId, body, user.id);
    }

    @Get(":id")
    get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
        return this.templates.get(user.workspaceId, id);
    }

    @Post()
    @RequirePermissions(PERMISSIONS.CONTENT_UPDATE)
    create(@CurrentUser() user: AuthUser, @Body() body: { name?: unknown; element?: unknown; values?: unknown }) {
        return this.templates.create(user.workspaceId, body, user.id);
    }

    @Patch(":id")
    @RequirePermissions(PERMISSIONS.CONTENT_UPDATE)
    update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: { name?: unknown; values?: unknown }) {
        return this.templates.update(user.workspaceId, id, body);
    }

    @Post(":id/duplicate")
    @RequirePermissions(PERMISSIONS.CONTENT_UPDATE)
    duplicate(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: { name?: unknown }) {
        return this.templates.duplicate(user.workspaceId, id, body?.name, user.id);
    }

    @Delete(":id")
    @RequirePermissions(PERMISSIONS.CONTENT_DELETE)
    remove(@CurrentUser() user: AuthUser, @Param("id") id: string, @Query("force") force?: string) {
        return this.templates.remove(user.workspaceId, id, force === "1" || force === "true");
    }
}
