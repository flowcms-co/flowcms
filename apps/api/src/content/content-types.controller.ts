import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { PERMISSIONS } from "@flowcms/shared";
import { CurrentUser, RequirePermissions } from "../auth/decorators";
import type { AuthUser } from "../auth/types";
import { CreateContentTypeDto, UpdateContentTypeDto } from "./dto";
import { ContentTypesService } from "./content-types.service";

@Controller("content-types")
export class ContentTypesController {
    constructor(private readonly types: ContentTypesService) {}

    // Anyone who can read content can read the model (needed to author entries).
    @Get()
    @RequirePermissions(PERMISSIONS.CONTENT_READ)
    list(@CurrentUser() user: AuthUser) {
        return this.types.list(user.workspaceId);
    }

    // Reusable components (kind=COMPONENT) — for the Schema Builder library + the
    // block editor's "Add block" picker. Declared before any `:id` route.
    @Get("components")
    @RequirePermissions(PERMISSIONS.CONTENT_READ)
    listComponents(@CurrentUser() user: AuthUser) {
        return this.types.listComponents(user.workspaceId);
    }

    // Defining the content model is a structural action — Super Admin / Admin.
    @Post()
    @RequirePermissions(PERMISSIONS.WORKSPACE_MANAGE)
    create(@CurrentUser() user: AuthUser, @Body() dto: CreateContentTypeDto) {
        return this.types.create(user.workspaceId, dto);
    }

    @Patch(":id")
    @RequirePermissions(PERMISSIONS.WORKSPACE_MANAGE)
    update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpdateContentTypeDto) {
        return this.types.update(user.workspaceId, id, dto);
    }

    @Delete(":id")
    @RequirePermissions(PERMISSIONS.WORKSPACE_MANAGE)
    remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
        return this.types.remove(user.workspaceId, id);
    }
}
