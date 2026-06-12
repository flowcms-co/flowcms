import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { PERMISSIONS } from "@flowcms/shared";
import { CurrentUser, RequirePermissions } from "../auth/decorators";
import type { AuthUser } from "../auth/types";
import { PageTemplatesService } from "./page-templates.service";
import { UpsertTemplateDto } from "./dto";

/** Reusable page/content starter presets. Anyone who can read content sees them;
 *  managing presets needs content-update; "use" needs content-create. */
@Controller("page-templates")
@RequirePermissions(PERMISSIONS.CONTENT_READ)
export class PageTemplatesController {
    constructor(private readonly templates: PageTemplatesService) {}

    @Get()
    list(@CurrentUser() user: AuthUser) {
        return this.templates.list(user.workspaceId);
    }

    @Post()
    @RequirePermissions(PERMISSIONS.CONTENT_UPDATE)
    create(@CurrentUser() user: AuthUser, @Body() dto: UpsertTemplateDto) {
        return this.templates.create(user.workspaceId, dto, user.id);
    }

    @Patch(":id")
    @RequirePermissions(PERMISSIONS.CONTENT_UPDATE)
    update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpsertTemplateDto) {
        return this.templates.update(user.workspaceId, id, dto);
    }

    @Delete(":id")
    @RequirePermissions(PERMISSIONS.CONTENT_UPDATE)
    remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
        return this.templates.remove(user.workspaceId, id);
    }

    @Post(":id/use")
    @RequirePermissions(PERMISSIONS.CONTENT_CREATE)
    use(@CurrentUser() user: AuthUser, @Param("id") id: string) {
        return this.templates.use(user.workspaceId, id, user.id);
    }
}
