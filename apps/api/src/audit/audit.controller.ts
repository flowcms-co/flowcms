import { Body, Controller, Get, Patch, Query } from "@nestjs/common";
import { ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsInt, IsOptional, Max, Min } from "class-validator";
import { PERMISSIONS } from "@flowcms/shared";
import { CurrentUser, RequirePermissions } from "../auth/decorators";
import type { AuthUser } from "../auth/types";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService, MIN_RETENTION_DAYS, type ActivityFilter } from "./audit.service";

class ActivitySettingsDto {
    @IsOptional() @IsInt() @Min(MIN_RETENTION_DAYS) @Max(3650) auditRetentionDays?: number;
    @IsOptional() @IsBoolean() alertsEnabled?: boolean;
    @IsOptional() @IsArray() @ArrayMaxSize(20) @IsEmail({}, { each: true }) alertEmails?: string[];
}

/** The query string filters every activity route accepts. */
export function activityFilter(q: Record<string, string | undefined>): ActivityFilter {
    return { user: q.user, action: q.action, type: q.type, entry: q.entry, q: q.q, from: q.from, to: q.to, limit: Number(q.limit) || undefined, offset: Number(q.offset) || undefined };
}

/** The workspace activity log (Super Admin / Admin: security.manage). */
@Controller()
@RequirePermissions(PERMISSIONS.SECURITY_MANAGE)
export class AuditController {
    constructor(
        private readonly audit: AuditService,
        private readonly prisma: PrismaService,
    ) {}

    /** The newest events as a plain list (the Security page's recent rows). */
    @Get("audit")
    async recent(@CurrentUser() user: AuthUser, @Query("limit") limit?: string) {
        return (await this.audit.list(user.workspaceId, { limit: Number(limit) || 100 })).items;
    }

    /** ?user=&action=&type=&entry=&q=&from=&to=&limit=&offset= → { items, total }. */
    @Get("activity")
    list(@CurrentUser() user: AuthUser, @Query() q: Record<string, string | undefined>) {
        return this.audit.list(user.workspaceId, activityFilter(q));
    }

    @Get("activity/actors")
    actors(@CurrentUser() user: AuthUser) {
        return this.audit.actors(user.workspaceId);
    }

    @Get("activity/settings")
    settings(@CurrentUser() user: AuthUser) {
        return this.prisma.workspace.findUniqueOrThrow({ where: { id: user.workspaceId }, select: { auditRetentionDays: true, alertsEnabled: true, alertEmails: true } });
    }

    @Patch("activity/settings")
    async updateSettings(@CurrentUser() user: AuthUser, @Body() dto: ActivitySettingsDto) {
        const before = await this.settings(user);
        const after = await this.prisma.workspace.update({
            where: { id: user.workspaceId },
            data: dto,
            select: { auditRetentionDays: true, alertsEnabled: true, alertEmails: true },
        });
        this.audit.record({ workspaceId: user.workspaceId, action: "workspace.activity_settings", resource: "Workspace", resourceId: user.workspaceId, metadata: { before, after } });
        return after;
    }
}
