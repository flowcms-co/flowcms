import { Body, Controller, Delete, Get, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { IsString } from "class-validator";
import { PERMISSIONS } from "@flowcms/shared";
import { CurrentUser, RequirePermissions } from "../auth/decorators";
import type { AuthUser } from "../auth/types";
import { AuditService } from "../audit/audit.service";
import { LicenseService } from "./license.service";

class SetLicenseDto {
    @IsString() key!: string;
}

@Controller("license")
export class LicenseController {
    constructor(
        private readonly license: LicenseService,
        private readonly audit: AuditService,
    ) {}

    /** Current plan + entitlements (no raw key returned). Any authed user — the UI gates on it. */
    @Get()
    info(@CurrentUser() _user: AuthUser) {
        return this.license.info();
    }

    @Post()
    @RequirePermissions(PERMISSIONS.SECURITY_MANAGE)
    async set(@CurrentUser() user: AuthUser, @Body() dto: SetLicenseDto, @Req() req: Request) {
        const info = await this.license.setKey(dto.key);
        this.audit.record({ workspaceId: user.workspaceId, userId: user.id, action: "license.set", resource: "License", metadata: { plan: info.plan, features: info.features }, ip: req.ip });
        return info;
    }

    @Delete()
    @RequirePermissions(PERMISSIONS.SECURITY_MANAGE)
    async clear(@CurrentUser() user: AuthUser, @Req() req: Request) {
        const info = await this.license.clear();
        this.audit.record({ workspaceId: user.workspaceId, userId: user.id, action: "license.clear", resource: "License", ip: req.ip });
        return info;
    }
}
