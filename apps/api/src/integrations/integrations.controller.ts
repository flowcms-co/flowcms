import { Body, Controller, Delete, Get, Param, Post, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import { PERMISSIONS } from "@flowcms/shared";
import { CurrentUser, RequirePermissions } from "../auth/decorators";
import type { AuthUser } from "../auth/types";
import { AuditService } from "../audit/audit.service";
import { ConnectIntegrationDto } from "./dto";
import { IntegrationsService } from "./integrations.service";

@Controller("integrations")
@RequirePermissions(PERMISSIONS.INTEGRATIONS_MANAGE)
export class IntegrationsController {
    constructor(
        private readonly integrations: IntegrationsService,
        private readonly audit: AuditService,
    ) {}

    @Get("providers")
    catalog() {
        return this.integrations.catalog();
    }

    @Get()
    list(@CurrentUser() user: AuthUser) {
        return this.integrations.list(user.workspaceId);
    }

    @Post()
    async connect(@CurrentUser() user: AuthUser, @Body() dto: ConnectIntegrationDto, @Req() req: Request) {
        const created = await this.integrations.connect(user.workspaceId, dto, user.id);
        const d = dto as unknown as Record<string, unknown>;
        this.audit.record({ workspaceId: user.workspaceId, userId: user.id, action: "integration.connect", resource: "Integration", resourceId: (created as { id?: string })?.id, metadata: { type: d.type ?? d.provider }, ip: req.ip });
        return created;
    }

    @Throttle({ default: { limit: 15, ttl: 60_000 } }) // fires an outbound connection
    @Post(":id/test")
    test(@CurrentUser() user: AuthUser, @Param("id") id: string) {
        return this.integrations.test(user.workspaceId, id);
    }

    @Delete(":id")
    async remove(@CurrentUser() user: AuthUser, @Param("id") id: string, @Req() req: Request) {
        const res = await this.integrations.remove(user.workspaceId, id);
        this.audit.record({ workspaceId: user.workspaceId, userId: user.id, action: "integration.remove", resource: "Integration", resourceId: id, ip: req.ip });
        return res;
    }
}
