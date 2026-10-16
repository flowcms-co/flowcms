import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { PERMISSIONS } from "@flowcms/shared";
import { CurrentUser, RequirePermissions } from "../auth/decorators";
import type { AuthUser } from "../auth/types";
import { CreateContentTypeDto, UpdateContentTypeDto } from "./dto";
import { ContentTypesService } from "./content-types.service";
import { AuditService } from "../audit/audit.service";

@Controller("content-types")
export class ContentTypesController {
    constructor(
        private readonly types: ContentTypesService,
        private readonly audit: AuditService,
    ) {}

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
    async create(@CurrentUser() user: AuthUser, @Body() dto: CreateContentTypeDto) {
        const t = await this.types.create(user.workspaceId, dto);
        const r = t as { id?: string; name?: string; apiId?: string };
        this.audit.record({ workspaceId: user.workspaceId, action: "model.create", resource: "ContentType", resourceId: r.id, title: r.name, entryType: r.apiId });
        return t;
    }

    @Patch(":id")
    @RequirePermissions(PERMISSIONS.WORKSPACE_MANAGE)
    async update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpdateContentTypeDto) {
        const t = await this.types.update(user.workspaceId, id, dto);
        const r = t as { name?: string; apiId?: string };
        this.audit.record({ workspaceId: user.workspaceId, action: "model.update", resource: "ContentType", resourceId: id, title: r?.name, entryType: r?.apiId, metadata: { fields: Object.keys(dto) } });
        return t;
    }

    @Delete(":id")
    @RequirePermissions(PERMISSIONS.WORKSPACE_MANAGE)
    async remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
        const r = await this.types.remove(user.workspaceId, id);
        this.audit.record({ workspaceId: user.workspaceId, action: "model.delete", resource: "ContentType", resourceId: id });
        return r;
    }
}
