import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { PERMISSIONS } from "@flowcms/shared";
import { CurrentUser, RequirePermissions } from "../auth/decorators";
import type { AuthUser } from "../auth/types";
import { AuditService } from "../audit/audit.service";
import { CreateRoleDto, UpdateRoleDto } from "./dto";
import { RolesService } from "./roles.service";

@Controller("roles")
export class RolesController {
    constructor(
        private readonly roles: RolesService,
        private readonly audit: AuditService,
    ) {}

    // Any authenticated user can read the permission catalog (for the UI).
    @Get("catalog")
    catalog() {
        return this.roles.catalog();
    }

    @Get()
    @RequirePermissions(PERMISSIONS.ROLES_MANAGE)
    list(@CurrentUser() user: AuthUser) {
        return this.roles.list(user.workspaceId);
    }

    @Post()
    @RequirePermissions(PERMISSIONS.ROLES_MANAGE)
    async create(@CurrentUser() user: AuthUser, @Body() dto: CreateRoleDto, @Req() req: Request) {
        const created = await this.roles.create(user.workspaceId, dto);
        this.audit.record({ workspaceId: user.workspaceId, userId: user.id, action: "role.create", resource: "Role", resourceId: (created as { id?: string })?.id, metadata: { name: dto.name }, ip: req.ip });
        return created;
    }

    @Patch(":id")
    @RequirePermissions(PERMISSIONS.ROLES_MANAGE)
    async update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpdateRoleDto, @Req() req: Request) {
        const updated = await this.roles.update(user.workspaceId, id, dto);
        // Permission changes are high-signal for audit: record which keys changed.
        this.audit.record({ workspaceId: user.workspaceId, userId: user.id, action: "role.update", resource: "Role", resourceId: id, metadata: { fields: Object.keys(dto) }, ip: req.ip });
        return updated;
    }

    @Delete(":id")
    @RequirePermissions(PERMISSIONS.ROLES_MANAGE)
    async remove(@CurrentUser() user: AuthUser, @Param("id") id: string, @Req() req: Request) {
        const res = await this.roles.remove(user.workspaceId, id);
        this.audit.record({ workspaceId: user.workspaceId, userId: user.id, action: "role.delete", resource: "Role", resourceId: id, ip: req.ip });
        return res;
    }
}
