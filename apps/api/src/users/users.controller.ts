import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { PERMISSIONS } from "@flowcms/shared";
import { CurrentUser, RequirePermissions } from "../auth/decorators";
import type { AuthUser } from "../auth/types";
import { AuditService } from "../audit/audit.service";
import { CreateUserDto, UpdateUserDto } from "./dto";
import { UsersService } from "./users.service";

@Controller("users")
@RequirePermissions(PERMISSIONS.USERS_MANAGE)
export class UsersController {
    constructor(
        private readonly users: UsersService,
        private readonly audit: AuditService,
    ) {}

    @Get()
    list(@CurrentUser() user: AuthUser) {
        return this.users.list(user.workspaceId);
    }

    @Post()
    async create(@CurrentUser() user: AuthUser, @Body() dto: CreateUserDto, @Req() req: Request) {
        const created = await this.users.create(user.workspaceId, dto, user.id);
        this.audit.record({ workspaceId: user.workspaceId, userId: user.id, action: "user.create", resource: "User", resourceId: (created as { id?: string })?.id, metadata: { email: dto.email }, ip: req.ip });
        return created;
    }

    @Patch(":id")
    async update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpdateUserDto, @Req() req: Request) {
        const updated = await this.users.update(user.workspaceId, user.id, id, dto);
        this.audit.record({ workspaceId: user.workspaceId, userId: user.id, action: "user.update", resource: "User", resourceId: id, metadata: { fields: Object.keys(dto) }, ip: req.ip });
        return updated;
    }

    @Delete(":id")
    async remove(@CurrentUser() user: AuthUser, @Param("id") id: string, @Req() req: Request) {
        const res = await this.users.remove(user.workspaceId, user.id, id);
        this.audit.record({ workspaceId: user.workspaceId, userId: user.id, action: "user.delete", resource: "User", resourceId: id, ip: req.ip });
        return res;
    }
}
