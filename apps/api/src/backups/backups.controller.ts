import { Body, Controller, ForbiddenException, Get, Param, Post, Res } from "@nestjs/common";
import type { Response } from "express";
import { IsOptional, IsString, MaxLength } from "class-validator";
import { CurrentUser } from "../auth/decorators";
import type { AuthUser } from "../auth/types";
import { BackupsService } from "./backups.service";

class CreateBackupDto {
    @IsOptional() @IsString() @MaxLength(300) note?: string;
}

class RollbackDto {
    /** The workspace's name, typed to confirm. */
    @IsString() confirm!: string;
}

/** Super Admin only, whatever other permissions a role holds. */
function requireSuperAdmin(user: AuthUser) {
    if (user.role.key !== "super_admin") throw new ForbiddenException("Only a Super Admin can manage backups and roll back the workspace.");
}

/** Workspace backups and the master rollback (Settings › Workspace › System). */
@Controller("backups")
export class BackupsController {
    constructor(private readonly backups: BackupsService) {}

    @Get()
    list(@CurrentUser() user: AuthUser) {
        requireSuperAdmin(user);
        return this.backups.list(user.workspaceId);
    }

    @Post()
    create(@CurrentUser() user: AuthUser, @Body() dto: CreateBackupDto) {
        requireSuperAdmin(user);
        return this.backups.create(user.workspaceId, "manual", dto.note?.trim() || undefined);
    }

    @Get(":id/download")
    async download(@CurrentUser() user: AuthUser, @Param("id") id: string, @Res() res: Response) {
        requireSuperAdmin(user);
        const b = await this.backups.download(user.workspaceId, id);
        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader("Content-Disposition", `attachment; filename="flowcms-backup-${b.createdAt.toISOString().slice(0, 19).replace(/:/g, "")}.json.br"`);
        res.send(Buffer.from(b.data));
    }

    @Post(":id/rollback")
    async rollback(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: RollbackDto) {
        requireSuperAdmin(user);
        return this.backups.rollback(user.workspaceId, id, dto.confirm);
    }
}
