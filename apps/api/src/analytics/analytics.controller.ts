import { Body, Controller, Delete, Get, Param, Post, Query } from "@nestjs/common";
import { PERMISSIONS } from "@flowcms/shared";
import { CurrentUser, RequirePermissions } from "../auth/decorators";
import type { AuthUser } from "../auth/types";
import { AnalyticsService } from "./analytics.service";
import { ConnectAnalyticsDto } from "./dto";

@Controller("analytics")
export class AnalyticsController {
    constructor(private readonly analytics: AnalyticsService) {}

    @Get("status")
    @RequirePermissions(PERMISSIONS.ANALYTICS_READ)
    status(@CurrentUser() user: AuthUser) {
        return this.analytics.status(user.workspaceId);
    }

    @Get("overview")
    @RequirePermissions(PERMISSIONS.ANALYTICS_READ)
    overview(@CurrentUser() user: AuthUser, @Query("days") days?: string) {
        const n = Math.min(Math.max(Number(days) || 30, 1), 365);
        return this.analytics.overview(user.workspaceId, n);
    }

    @Post("connect")
    @RequirePermissions(PERMISSIONS.INTEGRATIONS_MANAGE)
    connect(@CurrentUser() user: AuthUser, @Body() dto: ConnectAnalyticsDto) {
        return this.analytics.connect(user.workspaceId, user.id, dto);
    }

    @Post("sync")
    @RequirePermissions(PERMISSIONS.INTEGRATIONS_MANAGE)
    sync(@CurrentUser() user: AuthUser) {
        return this.analytics.sync(user.workspaceId);
    }

    @Delete(":provider")
    @RequirePermissions(PERMISSIONS.INTEGRATIONS_MANAGE)
    disconnect(@CurrentUser() user: AuthUser, @Param("provider") provider: "gsc" | "ga4") {
        return this.analytics.disconnect(user.workspaceId, provider);
    }
}
