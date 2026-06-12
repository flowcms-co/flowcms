import { Body, Controller, Delete, Get, Param, Post, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import { PERMISSIONS } from "@flowcms/shared";
import { CurrentUser, RequirePermissions } from "../auth/decorators";
import type { AuthUser } from "../auth/types";
import { AuditService } from "../audit/audit.service";
import { ConnectConnectorDto } from "./dto";
import { ConnectorsService } from "./connectors.service";

/**
 * Automation connectors (Slack / Zapier). Same permission as other integrations.
 * Slack is additionally gated to a Pro license inside the service.
 */
@Controller("connectors")
@RequirePermissions(PERMISSIONS.INTEGRATIONS_MANAGE)
export class ConnectorsController {
    constructor(
        private readonly connectors: ConnectorsService,
        private readonly audit: AuditService,
    ) {}

    @Get()
    list(@CurrentUser() user: AuthUser) {
        return this.connectors.list(user.workspaceId);
    }

    @Throttle({ default: { limit: 15, ttl: 60_000 } }) // fires an outbound connection
    @Post()
    async connect(@CurrentUser() user: AuthUser, @Body() dto: ConnectConnectorDto, @Req() req: Request) {
        const created = await this.connectors.connect(user.workspaceId, dto, user.id);
        this.audit.record({
            workspaceId: user.workspaceId,
            userId: user.id,
            action: "integration.connect",
            resource: "Connector",
            resourceId: created.connector.id,
            metadata: { provider: dto.provider },
            ip: req.ip,
        });
        return created;
    }

    @Throttle({ default: { limit: 15, ttl: 60_000 } })
    @Post(":id/test")
    test(@CurrentUser() user: AuthUser, @Param("id") id: string) {
        return this.connectors.test(user.workspaceId, id);
    }

    @Delete(":id")
    async remove(@CurrentUser() user: AuthUser, @Param("id") id: string, @Req() req: Request) {
        const res = await this.connectors.remove(user.workspaceId, id);
        this.audit.record({
            workspaceId: user.workspaceId,
            userId: user.id,
            action: "integration.remove",
            resource: "Connector",
            resourceId: id,
            ip: req.ip,
        });
        return res;
    }
}
